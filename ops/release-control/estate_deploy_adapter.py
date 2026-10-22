#!/usr/bin/env python3
"""Tuku-PM policy-gated Docker Compose cutover; DISABLED unless operator-authorized.

The deploy driver cannot mint CI, A3 or QA evidence and cannot close JakeOS
Work. No migrations; only pre-pinned images. A separately signed deployment
attestation is emitted only after independent CI+A3 verification, actual
restore-tested database backup, cutover, image parity and secondary live checks.
"""
import argparse
import fcntl
import re
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
import sys
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from estate_release_guard import REGISTRY,validate
from estate_release_intent import evaluate,canonical,broker_token,github_json
from estate_deploy_preflight import validate_candidate
from estate_receipt_issuer import inspect_runtime,probe_live

BACKUP_ROOT=Path("/opt/tuku/backups/lendflow")
ALLOWED_DB={"lendflow":("lendflow-db","lendflow","lendflow","postgres:16-alpine")}
ROOT_REGISTRY=Path("/opt/tuku/agent-os/ops/estate-release-registry.json")
KEY_PATH=Path("/etc/tuku-pm/deploy-private.pem")
CI_KEY=Path("/etc/tuku-pm/ci-public.pem")
A3_KEY=Path("/etc/tuku-pm/a3-approval-public.pem")

def run(argv,timeout=45):
    if not isinstance(argv,list) or not argv or argv[0]!="docker":
        raise ValueError("Execution restricted to Docker")
    return subprocess.run(argv,check=True,capture_output=True,text=True,timeout=timeout)

def compose_args(product,overlay,services):
    files=[item["path"] for item in product["compose_files"]]
    if not all(p.startswith("/opt/tuku/") for p in files):
        raise ValueError("Non-canonical Compose file")
    args=["docker","compose"]
    for path in files:args+=["-f",path]
    args+=["-f",str(overlay)]
    return args+["up","-d","--no-build","--no-deps","--force-recreate"]+list(services)

def backup_and_prove_restore(name,folder,run_command=run):
    if name not in ALLOWED_DB:raise ValueError("No reviewed backup driver for this product")
    container,pguser,dbname,image=ALLOWED_DB[name]
    folder.mkdir(parents=True,mode=0o700,exist_ok=False)
    os.chmod(folder,0o700)
    dbfile=folder/"production.dump"
    with dbfile.open("xb") as stream:
        os.chmod(dbfile,0o600)
        command=subprocess.run(["docker","exec",container,"pg_dump","-Fc","-U",pguser,"-d",dbname],
                         stdout=stream,stderr=subprocess.PIPE,timeout=100)
        if command.returncode:raise ValueError("Production backup failed")
    if dbfile.stat().st_size<1024:raise ValueError("Production database backup too small")
    digest=hashlib.sha256(dbfile.read_bytes()).hexdigest()
    restore="lf-restore-"+secrets.token_hex(6)
    passwd=secrets.token_urlsafe(30)
    try:
        run_command(["docker","run","-d","--rm","--pull","never","--network","none",
             "--name",restore,"-v",str(folder)+":/backup:ro",
             "-e","POSTGRES_USER=restore","-e","POSTGRES_DB=restore",
             "-e","POSTGRES_PASSWORD="+passwd,image],55)
        for _ in range(35):
            r=subprocess.run(["docker","exec",restore,"pg_isready","-U","restore","-d","restore"],
                             capture_output=True,timeout=8)
            if r.returncode==0:break
            time.sleep(1)
        else:raise ValueError("Disposable restore DB was not ready")
        run_command(["docker","exec",restore,"pg_restore","-U","restore","-d","restore",
             "--no-owner","--no-privileges","/backup/production.dump"],90)
        rows=run_command(["docker","exec",restore,"psql","-U","restore","-d","restore",
              "-Atc","SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"],25)
        if int(rows.stdout.strip())<1:raise ValueError("Restored database has no tables")
        return {"sha256":"sha256:"+digest,"restore_test":"passed","restored_tables":int(rows.stdout.strip())}
    finally:
        try:run_command(["docker","rm","-f",restore],25)
        except Exception:pass

def verify_target(candidate,source_sha,read_container=inspect_runtime):
    for name,item in candidate["images"].items():
        actual=read_container(name)
        cfg=actual.get("Config") or {}
        if actual.get("Image")!=item["image_id"] or cfg.get("Image")!=item["tag"]:
            raise ValueError("Live image digest differs from pinned release: "+name)
        labels=cfg.get("Labels") or {}
        if labels.get("org.opencontainers.image.revision")!=source_sha:
            raise ValueError("Live source revision mismatch: "+name)
        st=actual.get("State") or {}
        if not st.get("Running") or (st.get("Health") and st["Health"].get("Status")!="healthy"):
            raise ValueError("Live app service failed health: "+name)
    return True

def verify_rollback(product,read_container=inspect_runtime):
    for container,entry in product["services"].items():
        observed=read_container(container)
        if observed.get("Image")!=entry.get("image_id") or (observed.get("Config") or {}).get("Image")!=entry.get("image"):
            raise ValueError("Original production image failed immutable rollback verification: "+container)
    return True

def perform_cutover(product,plan,candidate,release_dir,runner=run,read_container=inspect_runtime,probe=probe_live,sleeper=time.sleep):
    service_names=list(plan["candidate_overlay"]["services"])
    release_dir.mkdir(parents=True,mode=0o700,exist_ok=False)
    os.chmod(release_dir,0o700)
    candidate_path=release_dir/"candidate.compose.json"
    rollback_path=release_dir/"rollback.compose.json"
    for path,overlay in ((candidate_path,plan["candidate_overlay"]),(rollback_path,plan["rollback_overlay"])):
        with path.open("x") as stream:
            os.chmod(path,0o600);json.dump(overlay,stream,indent=2)
    new_args=compose_args(product,candidate_path,service_names)
    old_args=compose_args(product,rollback_path,service_names)
    # Config validation and initial availability BEFORE touching production.
    def check_all(expected=None):
        if expected:verify_target(candidate,plan["source_revision"],read_container)
        for url in product.get("health_urls",{}).values():
            if not probe(url):raise ValueError("Production health endpoint failed")
    check_all()
    # Validate the active Compose stack without exposing expanded secrets.
    config_args=new_args[:-(len(service_names)+5)]+["config","--quiet"]
    runner(config_args,25)
    started=False
    try:
        started=True
        runner(new_args,110)
        for attempt in range(35):
            try:
                check_all(expected=True)
                sleeper(8)
                check_all(expected=True)
                return {"cutover_status":"verified_live","service_count":len(service_names)}
            except (ValueError,subprocess.CalledProcessError):
                if attempt==34:raise
                sleeper(3)
    except Exception:
        if started:
            try:
                runner(old_args,110)
                for attempt in range(20):
                    try:
                        verify_rollback(product,read_container)
                        check_all()
                        break
                    except Exception:
                        if attempt==19:raise
                        sleeper(3)
            except Exception as fail:
                raise RuntimeError("CRITICAL rollback attempt failed") from fail
        raise

def rollback_after_failed_evidence(product,release_dir,runner=run,read_container=inspect_runtime,probe=probe_live,sleeper=time.sleep):
    rollback_file=release_dir/"rollback.compose.json"
    if not rollback_file.is_file():raise ValueError("Immutable rollback manifest unavailable")
    service_names=list(json.loads(rollback_file.read_text())["services"])
    runner(compose_args(product,rollback_file,service_names),110)
    for attempt in range(20):
        try:
            verify_rollback(product,read_container)
            for url in product.get("health_urls",{}).values():
                if not probe(url):raise ValueError("Rollback health failed")
            return True
        except Exception:
            if attempt==19:raise RuntimeError("CRITICAL original image rollback failed")
            sleeper(3)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--request",required=True,type=Path)
    ap.add_argument("--candidate",required=True,type=Path)
    ap.add_argument("--ci-envelope",type=Path)
    ap.add_argument("--a3-envelope",type=Path)
    ap.add_argument("--execute",action="store_true")
    args=ap.parse_args()
    registry=json.loads(ROOT_REGISTRY.read_text())
    request=json.loads(args.request.read_text())
    candidate=json.loads(args.candidate.read_text())
    products=validate(registry)
    name=request.get("product")
    if name not in products:raise ValueError("Product not registered")
    product=products[name]
    plan=validate_candidate(registry,request,candidate)
    if not args.execute:
        print(json.dumps({"state":"DRY_RUN_ONLY","plan":plan,"production_changed":False},sort_keys=True))
        return
    if os.geteuid()!=0 or not product.get("automatic_deploy_enabled"):
        raise ValueError("Automatic production deployment not activated by approved policy")
    if name not in ALLOWED_DB:raise ValueError("No independently reviewed cutover/backup driver")
    dispatch=request.get("jakeos_dispatch")
    if not isinstance(dispatch,dict) or not re.fullmatch(r"dispatch_[A-Za-z0-9_-]+",str(dispatch.get("dispatch_id",""))) or        dispatch.get("work_item_id")!=request.get("work_item_id") or not re.fullmatch(r"[a-f0-9]{40}",str(dispatch.get("base_sha",""))):
        raise ValueError("Release is not bound to a valid JakeOS dispatch")
    lock=open("/run/lock/tuku-pm-estate-release.lock","a")
    fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    if not args.ci_envelope or not args.a3_envelope:raise ValueError("Signed CI and A3 required")
    signpath=KEY_PATH
    st=signpath.stat()
    if st.st_uid!=0 or not stat.S_ISREG(st.st_mode) or st.st_mode&0o077:
        raise ValueError("Independent deployment signing identity not safely provisioned")
    signer=load_pem_private_key(signpath.read_bytes(),password=None)
    if not isinstance(signer,Ed25519PrivateKey):raise ValueError("Invalid deployment signing identity")
    ci=json.loads(args.ci_envelope.read_text())
    a3=json.loads(args.a3_envelope.read_text())
    token=broker_token(request["repository"])
    def pget(repo,n):return github_json("/repos/"+repo+"/pulls/"+str(n),token)
    def cget(repo,sha):return github_json("/repos/"+repo+"/commits/"+sha,token)
    authorized=evaluate(registry,request,ci,a3,CI_KEY.read_bytes(),A3_KEY.read_bytes(),pget,cget)
    if authorized["deployment_permitted"] is not True:
        raise ValueError("Signed release not independently authorized for automatic production")
    # An actual independent and protected backup/restore follows; no migrations.
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest=BACKUP_ROOT/(name+"-"+request["merge_commit"][:12]+"-"+stamp)
    backup=backup_and_prove_restore(name,dest)
    release_dir=dest/"release"
    outcome=perform_cutover(product,plan,candidate,release_dir)
    try:
        deployed=dt.datetime.now(dt.timezone.utc)
        evidence={
          "issued_at":deployed.isoformat(),"product":name,"repository":request["repository"],
          "pr_number":request["pr_number"],"work_item_id":request["work_item_id"],
          "source_revision":request["source_revision"],"merge_commit":request["merge_commit"],
          "artifact_digest":request["artifact_digest"],"rollback_digest":request["rollback_digest"],
          "artifact_type":"compose_image_set","status":"live","candidate":candidate,
          "production_url":product["health_urls"]["web"],"deployed_at":deployed.isoformat(),
          "backup":backup,"jakeos_dispatch":request["jakeos_dispatch"],
          "base_sha":request["jakeos_dispatch"]["base_sha"],"deployment_result":outcome}
        raw=canonical(evidence)
        envelope={"purpose":"tuku-pm-deploy-v1","payload":evidence,
           "signature":base64.urlsafe_b64encode(signer.sign(raw)).rstrip(b"=").decode()}
        final=dest/"signed-deployment.json"
        with final.open("x") as stream:
            os.chmod(final,0o600);json.dump(envelope,stream,sort_keys=True,indent=2)
            stream.flush();os.fsync(stream.fileno())
        print(json.dumps({"state":"SIGNED_DEPLOYMENT_EVIDENCE_EMITTED","release":request["merge_commit"],
            "production_url":product["health_urls"]["web"],"evidence_path":str(final)}))

    except Exception:
        rollback_after_failed_evidence(product,release_dir)
        raise

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print(json.dumps({"state":"DEPLOYMENT_BLOCKED","reason":type(exc).__name__,
                          "release_authorised":False}),file=sys.stderr)
        sys.exit(2)
