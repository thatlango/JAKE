#!/usr/bin/env python3
"""Independent, fail-closed Tuku-PM container release receipt issuer.

NO code execution, merging, CI, deployment or JakeOS Work closure. Sign only
when four distinct trust domains have bound the same immutable source and
artifact AND independently observed live containers and HTTPS health match.
Credentials, issuer key and live dispatch binding are operator-managed.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import urllib.request

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from estate_release_guard import REGISTRY,validate
from estate_release_intent import (
  canonical,verify,evidence_fresh,evaluate,broker_token,github_json,UTC
)
from estate_deploy_preflight import candidate_digest

EXPECTED_CHECKS=("ci","security","browser_e2e","permissions","live_health",
                 "live_user_journey","telemetry","rollback_ready")
CONTAINER_TYPES={"lendflow":"compose_image_set","jakeos":"oci_image"}
IDENTITY=re.compile(r"^sha256:[0-9a-f]{64}$")
DISPATCH=re.compile(r"^dispatch_[A-Za-z0-9_-]+$")
WORK=re.compile(r"^work_[A-Za-z0-9_-]+$")
SHA=re.compile(r"^[a-f0-9]{40}$")

def signature(receipt,private_key):
    if not isinstance(private_key,Ed25519PrivateKey):
        raise ValueError("Independent Ed25519 issuer identity absent")
    return base64.urlsafe_b64encode(private_key.sign(canonical(receipt))).rstrip(b"=").decode()

def inspect_runtime(container):
    if not re.fullmatch(r"[a-z][a-z0-9_-]{2,90}",container):
        raise ValueError("Invalid container")
    result=subprocess.run(["sudo","docker","inspect",container,"--format","{{json .}}"],
            capture_output=True,text=True,timeout=18)
    if result.returncode:raise ValueError("Live image inspection unavailable")
    return json.loads(result.stdout)

def probe_live(url):
    # URLs originate ONLY from the root-controlled product registry.
    if not isinstance(url,str) or not re.fullmatch(r"https://[a-z0-9.-]+(?:/[A-Za-z0-9_./-]*)?",url):
        raise ValueError("Unexpected production probe")
    req=urllib.request.Request(url,headers={"User-Agent":"Tuku-PM-Independent-ContainerReceipt/1"})
    with urllib.request.urlopen(req,timeout=14) as response:
        if response.status!=200:raise ValueError("Production HTTPS readiness failed")
        return True

def check_images(product, candidate, inspect, source_revision):
    expected=set(product["services"])
    images=candidate.get("images")
    if not isinstance(images,dict) or set(images)!=expected:
        raise ValueError("Production container set does not match registry")
    for name,entry in images.items():
        if not isinstance(entry,dict) or not IDENTITY.fullmatch(str(entry.get("image_id",""))):
            raise ValueError("Missing immutable image identity")
        actual=inspect(name)
        if actual.get("Image")!=entry["image_id"] or (actual.get("Config") or {}).get("Image")!=entry.get("tag"):
            raise ValueError("Production image ID/tag is not the attested artifact")
        labels=(actual.get("Config") or {}).get("Labels") or {}
        if labels.get("org.opencontainers.image.revision")!=source_revision:
            raise ValueError("Production revision does not match independently built source")
        if labels.get("org.opencontainers.image.source")!=product["repository"]:
            raise ValueError("Production repository provenance mismatch")
        state=actual.get("State") or {}
        if not state.get("Running"):raise ValueError("Production container not running")
        health=(state.get("Health") or {}).get("Status")
        if health and health!="healthy":raise ValueError("Unhealthy production container")
    if len(images)<1:raise ValueError("No deployed services")
    return candidate_digest(images)

def issue(registry,request,ci_envelope,a3_envelope,deploy_envelope,qa_envelope,keys,
          pr_get,commit_get,inspect=inspect_runtime,probe=probe_live,signer=None,at=None):
    at=at or dt.datetime.now(UTC)
    products=validate(registry)
    name=request.get("product")
    product=products.get(name)
    if not product:raise ValueError("Unregistered product")
    artifact_type=CONTAINER_TYPES.get(name)
    if artifact_type is None:
        raise ValueError("No independently verified container issuer policy for this product")
    if product.get("repository")!=request.get("repository"):
        raise ValueError("Wrong repo")
    ci_pub,a3_pub,deploy_pub,qa_pub=keys
    release=evaluate(registry,request,ci_envelope,a3_envelope,ci_pub,a3_pub,pr_get,commit_get,now=at)
    ci=verify(ci_envelope,ci_pub,"tuku-pm-ci-v1")
    deploy=verify(deploy_envelope,deploy_pub,"tuku-pm-deploy-v1")
    qa=verify(qa_envelope,qa_pub,"tuku-pm-qa-v1")
    for proof in (deploy,qa):evidence_fresh(proof,at,dt.timedelta(hours=2))
    for proof in (deploy,qa):
        for field in ("product","repository","work_item_id","source_revision","merge_commit","artifact_digest"):
            if proof.get(field)!=request.get(field):
                raise ValueError("Signed post-release proof does not match exact target: "+field)
    for field in ("rollback_digest","pr_number"):
        if deploy.get(field)!=request.get(field):
            raise ValueError("Deployment rollback or PR identity mismatch")
    if deploy.get("status")!="live" or qa.get("status")!="passed":
        raise ValueError("Deployment or QA is not verified as passing")
    if deploy.get("artifact_type")!=artifact_type:
        raise ValueError("Unsupported product artifact type")
    if qa.get("artifact_type")!=artifact_type:
        raise ValueError("QA proof was for a different artifact type")
    if not IDENTITY.fullmatch(str(request.get("rollback_digest",""))):
        raise ValueError("Missing immutable rollback evidence")
    candidates=deploy.get("candidate")
    if not isinstance(candidates,dict) or candidates.get("schema_version")!=1 or \
       candidates.get("product")!=name or candidates.get("source_revision")!=request["source_revision"]:
        raise ValueError("Deployment candidate source mismatch")
    measured_image_set=check_images(product,candidates,inspect,request["source_revision"])
    if artifact_type=="oci_image":
        if len(candidates["images"])!=1:raise ValueError("Single OCI receipt requires exactly one image")
        measured=next(iter(candidates["images"].values()))["image_id"]
    else:
        if len(candidates["images"])<2:raise ValueError("Compose image set requires multiple services")
        measured=measured_image_set
    if measured!=request["artifact_digest"] or measured!=ci.get("artifact_digest"):
        raise ValueError("Live artifact digest differs from signed CI")
    if qa.get("image_set_digest")!=measured:
        raise ValueError("Independent QA did not inspect this image set")
    checks=qa.get("checks")
    if not isinstance(checks,dict) or any(checks.get(c)!="passed" for c in EXPECTED_CHECKS):
        raise ValueError("Independent QA omitted mandatory checks")
    required_personas={"lendflow":{"owner","checker","cashier"},"jakeos":{"owner","ops"}}[name]
    actual_personas=qa.get("personas_verified")
    if not isinstance(actual_personas,list) or not required_personas.issubset(set(actual_personas)):
        raise ValueError("Independent QA missed product role journeys")
    for uri in product.get("health_urls",{}).values():
        if not probe(uri):raise ValueError("Production HTTPS check failed")
    url=product.get("health_urls",{}).get("web")
    if not url or not url.startswith("https://") or not url.endswith("/"):
        raise ValueError("Approved canonical production URL missing")
    if deploy.get("production_url")!=url or qa.get("production_url")!=url:
        raise ValueError("Deployed and QA production host mismatch")
    bound=deploy.get("jakeos_dispatch")
    if not isinstance(bound,dict):raise ValueError("JakeOS dispatch binding missing")
    dispatch=bound.get("dispatch_id")
    work=bound.get("work_item_id")
    base_sha=bound.get("base_sha")
    if not DISPATCH.fullmatch(str(dispatch or "")) or not WORK.fullmatch(str(work or "")) or \
       not SHA.fullmatch(str(base_sha or "")) or work!=request["work_item_id"]:
        raise ValueError("JakeOS Work/dispatch/base not reliably bound")
    if qa.get("dispatch_id")!=dispatch or qa.get("base_sha")!=base_sha:
        raise ValueError("Independent QA does not bind exact JakeOS Work")
    if deploy.get("base_sha")!=base_sha:
        raise ValueError("Deployment provenance base does not bind JakeOS Work")
    if signer is None:
        raise ValueError("Independent receipt issuer unavailable")
    deployed_time=dt.datetime.fromisoformat(deploy["deployed_at"].replace("Z","+00:00"))
    if deployed_time.tzinfo is None or deployed_time>at or at-deployed_time>dt.timedelta(hours=24):
        raise ValueError("Deployment freshness unacceptable")
    pr_url="https://github.com/"+request["repository"]+"/pull/"+str(request["pr_number"])
    receipt={
        "schema_version":1,"work_item_id":work,"dispatch_id":dispatch,
        "repository":request["repository"],"pull_request_url":pr_url,
        "base_sha":base_sha,"release_sha":request["merge_commit"],
        "build":{
           "status":"passed","commit_sha":request["merge_commit"],
           "build_url":ci["build_url"],"artifact_type":artifact_type,
           "artifact_digest":measured
        },
        "deployment":{
            "status":"live","commit_sha":request["merge_commit"],
            "artifact_type":artifact_type,"artifact_digest":measured,
            "rollback_digest":request["rollback_digest"],
            "production_url":url,"deployed_at":deployed_time.isoformat()
        },
        "checks":{c:"passed" for c in EXPECTED_CHECKS},
        "release_authority":"A3-approved",
        "release_approval_ref":a3_envelope["payload"].get("approval_ref",""),
        "verifier_id":"tuku-pm-independent-container-receipt-issuer",
        "verified_at":at.isoformat(timespec="seconds")
    }
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,150}",str(receipt["release_approval_ref"])):
        raise ValueError("Scoped A3 approval reference missing")
    return {"production_receipt":receipt,"production_signature":signature(receipt,signer)}

def read_root_key(path):
    p=Path(path)
    st=p.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o077:
        raise ValueError("Issuer private key must be root-only mode 0600")
    key=load_pem_private_key(p.read_bytes(),password=None)
    if not isinstance(key,Ed25519PrivateKey):raise ValueError("Issuer key is not Ed25519")
    return key

def main():
    ap=argparse.ArgumentParser()
    for field in ("request","ci-envelope","a3-envelope","deploy-envelope","qa-envelope","out"):
        ap.add_argument("--"+field,required=True,type=Path)
    ap.add_argument("--registry",type=Path,default=REGISTRY)
    args=ap.parse_args()
    if os.geteuid()!=0:raise ValueError("Independent issuer must be root operated")
    keys=tuple(Path("/etc/tuku-pm/"+n).read_bytes() for n in (
        "ci-public.pem","a3-approval-public.pem","deploy-public.pem","qa-public.pem"))
    signer=read_root_key("/etc/tuku-pm/release-signer-private.pem")
    if args.out.exists() or args.out.is_symlink():raise ValueError("Cannot overwrite a release receipt")
    request=json.loads(args.request.read_text())
    token=broker_token(request.get("repository"))
    def pr_get(repo,num):return github_json("/repos/"+repo+"/pulls/"+str(num),token)
    def commit_get(repo,sha):return github_json("/repos/"+repo+"/commits/"+sha,token)
    receipt=issue(json.loads(args.registry.read_text()),request,
        json.loads(args.ci_envelope.read_text()),json.loads(args.a3_envelope.read_text()),
        json.loads(args.deploy_envelope.read_text()),json.loads(args.qa_envelope.read_text()),
        keys,pr_get,commit_get,signer=signer)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(args.out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as out:
        json.dump(receipt,out,sort_keys=True,indent=2);out.write("\n");out.flush();os.fsync(out.fileno())
    print(json.dumps({"state":"INDEPENDENT_RECEIPT_ISSUED","path":str(args.out),"production_changed":False}))

if __name__=="__main__":
    try:main()
    except Exception as error:
        print(json.dumps({"state":"ISSUANCE_BLOCKED","reason":type(error).__name__,"production_changed":False}),file=sys.stderr)
        sys.exit(2)
