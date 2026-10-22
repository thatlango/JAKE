#!/usr/bin/env python3
"""Cross-product signed release-intent gate (no privileged deployment).

Only independently signed exact-source CI and A3 authorization can create
an intent. A release adapter and receipt issuer are separate trust domains.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sys
import urllib.error
import urllib.request

from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from estate_release_guard import REGISTRY, ROOT, SHA40, validate

UTC=dt.timezone.utc
DIGEST=re.compile(r"sha256:[0-9a-f]{64}")
URLROOT="https://api.github.com"
PURPOSE_CI="tuku-pm-ci-v1"
PURPOSE_APPROVAL="tuku-pm-a3-v1"
REQUIRED_CI_CHECKS=("build","integration","browser_e2e","security","tenant_permissions","financial","migration_compat","rollback_restore")

def canonical(payload):
    return json.dumps(payload,separators=(",",":"),ensure_ascii=False).encode()

def verify(envelope,key_pem,purpose):
    if not isinstance(envelope,dict) or envelope.get("purpose")!=purpose:raise ValueError("Signed evidence purpose mismatch")
    payload=envelope.get("payload")
    sig=envelope.get("signature")
    if not isinstance(payload,dict) or not isinstance(sig,str) or not re.fullmatch(r"[A-Za-z0-9_-]{85,88}",sig):
        raise ValueError("Malformed signature envelope")
    public=load_pem_public_key(key_pem)
    if not isinstance(public,Ed25519PublicKey):raise ValueError("Expected Ed25519 verifier key")
    try:
        public.verify(base64.urlsafe_b64decode(sig+"="*(-len(sig)%4)),canonical(payload))
    except Exception as exc:
        raise ValueError("Signature verification failed") from exc
    return payload

def timestamp(value):
    if not isinstance(value,str):raise ValueError("Missing evidence timestamp")
    obj=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
    if obj.tzinfo is None:raise ValueError("Naive evidence timestamp")
    return obj.astimezone(UTC)

def evidence_fresh(payload,now,age=dt.timedelta(hours=24)):
    created=timestamp(payload.get("issued_at"))
    if created>now+dt.timedelta(minutes=3) or now-created>age:raise ValueError("Stale or future-dated signed evidence")

def broker_token(repository,server="/run/tuku/github-broker.sock"):
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
        s.settimeout(12)
        s.connect(server)
        s.sendall((json.dumps({"operation":"read","repository":repository})+"\n").encode())
        result=b""
        while b"\n" not in result and len(result)<32768:
            block=s.recv(32768)
            if not block:break
            result+=block
    reply=json.loads(result.split(b"\n",1)[0])
    if not reply.get("ok") or not reply.get("token"):raise ValueError("Broker refused scoped read-only GitHub token")
    return reply["token"]

def github_json(path,token):
    req=urllib.request.Request(URLROOT+path,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","User-Agent":"Tuku-PM-GeneralReleaseGate/1"})
    with urllib.request.urlopen(req,timeout=18) as resp:
        return json.load(resp)

def github_merge_verified(request,pr_get,commit_get):
    repo=request["repository"]
    pr=pr_get(repo,request["pr_number"])
    if pr.get("state")!="closed" or pr.get("merged") is not True:
        raise ValueError("Pull request not merged")
    if pr.get("base",{}).get("repo",{}).get("full_name")!=repo or pr.get("base",{}).get("ref")!="main":
        raise ValueError("Wrong PR target repository or branch")
    if pr.get("head",{}).get("sha")!=request["source_revision"] or pr.get("merge_commit_sha")!=request["merge_commit"]:
        raise ValueError("PR head/merge SHA mismatch")
    actual=commit_get(repo,request["merge_commit"])
    if actual.get("sha")!=request["merge_commit"] or actual.get("commit",{}).get("tree",{}).get("sha")!=request["source_tree"]:
        raise ValueError("GitHub merge source tree not exact")
    return True

def evaluate(registry,request,ci_env,approval_env,ci_key,approval_key,pr_get,commit_get,now=None):
    now=now or dt.datetime.now(UTC)
    products=validate(registry)
    product=products.get(request.get("product"))
    if product is None:raise ValueError("Unregistered product")
    if product["mode"]!="release_control_candidate":raise ValueError("Product is observation-only")
    if request.get("repository")!=product["repository"]:raise ValueError("Repository mismatch")
    for field in ("source_revision","merge_commit","source_tree"):
        if not SHA40.fullmatch(str(request.get(field,""))):raise ValueError("Invalid "+field)
    if request.get("environment")!="production" or request.get("risk")!=product.get("release_risk"):
        raise ValueError("Release environment or risk mismatch")
    if not isinstance(request.get("pr_number"),int) or request["pr_number"]<1:raise ValueError("Invalid PR number")
    if not re.fullmatch(r"(?:work_|TASK-)[A-Za-z0-9_-]{6,120}",str(request.get("work_item_id",""))):
        raise ValueError("Invalid Work item ID")
    if not DIGEST.fullmatch(str(request.get("artifact_digest",""))):
        raise ValueError("Invalid immutable artifact digest")
    if not DIGEST.fullmatch(str(request.get("rollback_digest",""))):
        raise ValueError("Missing verified rollback digest")
    ci=verify(ci_env,ci_key,PURPOSE_CI)
    approval=verify(approval_env,approval_key,PURPOSE_APPROVAL)
    evidence_fresh(ci,now)
    evidence_fresh(approval,now)
    if ci.get("provider") not in ("google-cloud-build","github-actions"):
        raise ValueError("Unapproved independent CI provider")
    if ci.get("result")!="passed" or not re.fullmatch(r"[A-Za-z0-9_-]{8,120}",str(ci.get("provider_run_id",""))):
        raise ValueError("Independent CI not green")
    for field in ("repository","source_revision","merge_commit","source_tree","artifact_digest"):
        if ci.get(field)!=request[field]:raise ValueError("CI does not bind exact release: "+field)
    checks=ci.get("checks") or {}
    for check in REQUIRED_CI_CHECKS:
        if checks.get(check)!="passed":raise ValueError("CI gate not passed: "+check)
    if approval.get("result")!="approved" or approval.get("policy")!="A3":
        raise ValueError("Independent A3 approval missing")
    for field in ("product","repository","pr_number","work_item_id","source_revision","merge_commit","artifact_digest","risk","environment","rollback_digest"):
        if approval.get(field)!=request[field]:raise ValueError("A3 does not bind exact release: "+field)
    expiry=timestamp(approval.get("expires_at"))
    if not now<expiry<=now+dt.timedelta(days=3):
        raise ValueError("Approval expired or unreasonably long lived")
    github_merge_verified(request,pr_get,commit_get)
    result={
      "schema_version":1,"purpose":"tuku-pm-production-release-intent-v1",
      "product":request["product"],"repository":request["repository"],
      "pr_number":request["pr_number"],"work_item_id":request["work_item_id"],
      "source_revision":request["source_revision"],"merge_commit":request["merge_commit"],
      "source_tree":request["source_tree"],"artifact_digest":request["artifact_digest"],
      "rollback_digest":request["rollback_digest"],"environment":"production",
      "risk":request["risk"],"ci_run_id":ci["provider_run_id"],
      "a3_issued_at":approval["issued_at"],"approval_expires_at":approval["expires_at"],
      "generated_at":now.isoformat(),
      "ci_envelope_sha256":hashlib.sha256(canonical(ci_env)).hexdigest(),
      "approval_envelope_sha256":hashlib.sha256(canonical(approval_env)).hexdigest(),
      "deployment_permitted":bool(product.get("automatic_deploy_enabled")),
      "production_changed":False
    }
    return result

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--registry",type=Path,default=REGISTRY)
    ap.add_argument("--request",type=Path,required=True)
    ap.add_argument("--ci-envelope",type=Path,required=True)
    ap.add_argument("--approval-envelope",type=Path,required=True)
    ap.add_argument("--ci-public-key",type=Path,default=Path("/etc/tuku-pm/ci-public.pem"))
    ap.add_argument("--approval-public-key",type=Path,default=Path("/etc/tuku-pm/a3-approval-public.pem"))
    ap.add_argument("--emit",action="store_true")
    args=ap.parse_args()
    registry=json.loads(args.registry.read_text())
    request=json.loads(args.request.read_text())
    repo=request.get("repository","")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",repo):raise ValueError("Invalid repository")
    token=broker_token(repo)
    def pr_get(r,n):return github_json("/repos/"+r+"/pulls/"+str(n),token)
    def commit_get(r,c):return github_json("/repos/"+r+"/commits/"+c,token)
    result=evaluate(registry,request,json.loads(args.ci_envelope.read_text()),json.loads(args.approval_envelope.read_text()),args.ci_public_key.read_bytes(),args.approval_public_key.read_bytes(),pr_get,commit_get)
    if args.emit:
        if not result["deployment_permitted"]:raise ValueError("Product automatic release is not activated")
        folder=ROOT/"release-intents"
        folder.mkdir(parents=True,exist_ok=True)
        path=folder/(result["product"]+"-"+result["merge_commit"]+".json")
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"w") as file:
            json.dump(result,file,sort_keys=True,indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        result["intent_path"]=str(path)
    print(json.dumps(result,sort_keys=True,indent=2))
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except (ValueError,KeyError,OSError,urllib.error.URLError,TimeoutError) as exc:
        print(json.dumps({"stage":"blocked","reason":type(exc).__name__,"production_changed":False,"release_authorised":False}),file=sys.stderr)
        sys.exit(2)
