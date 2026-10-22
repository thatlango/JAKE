#!/usr/bin/env python3
"""Safe, read-only Compose release rehearsal for Tuku-PM.

A candidate image must be pinned by immutable Docker image ID, not just tag.
NO deployment, backup, signing, container restart, merge, or Work closure here.
Production cutover requires a separately approved privileged adapter.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from estate_release_guard import REGISTRY,ROOT,SHA40,validate,evaluate_product,disk_available_kib

IMAGE_TAG=re.compile(r"^[a-z0-9][a-z0-9./_-]{0,170}:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$")
IMAGE_ID=re.compile(r"^sha256:[a-f0-9]{64}$")

def actual_image(tag):
    if not IMAGE_TAG.fullmatch(tag):raise ValueError("Invalid image reference")
    result=subprocess.run(["sudo","docker","image","inspect",tag,"--format","{{json .}}"],capture_output=True,text=True,timeout=18)
    if result.returncode:raise ValueError("Candidate image is not installed locally")
    return json.loads(result.stdout)

def compose_service(container):
    result=subprocess.run(["sudo","docker","inspect",container,"--format","{{json .Config.Labels}}"],capture_output=True,text=True,timeout=18)
    if result.returncode:raise ValueError("Live container missing: "+container)
    labels=json.loads(result.stdout) or {}
    service=labels.get("com.docker.compose.service","")
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,70}",service):raise ValueError("Invalid Compose service identifier")
    return service

def candidate_digest(services):
    data=json.dumps(services,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    return "sha256:"+hashlib.sha256(data).hexdigest()

def validate_candidate(registry,request,candidate,inspect_image=actual_image,service_name=compose_service,live_status=None,free_kib=None):
    products=validate(registry)
    name=request.get("product")
    if name not in products:raise ValueError("Unregistered product")
    product=products[name]
    if product["mode"]!="release_control_candidate":raise ValueError("Product not released for candidate checks")
    if request.get("repository")!=product["repository"]:raise ValueError("Wrong repository")
    sha=request.get("source_revision")
    if not isinstance(sha,str) or not SHA40.fullmatch(sha):raise ValueError("Invalid source revision")
    if candidate.get("schema_version")!=1 or candidate.get("product")!=name or candidate.get("source_revision")!=sha:
        raise ValueError("Candidate is not bound to requested product/revision")
    image_map=candidate.get("images")
    if not isinstance(image_map,dict) or set(image_map)!=set(product["services"]):raise ValueError("All and only registered services required")
    if candidate_digest(image_map)!=request.get("artifact_digest"):raise ValueError("Candidate manifest digest is not bound to signed request")
    status=live_status or evaluate_product(name,product,with_probes=True)
    if status["status"]!="baseline_healthy":raise ValueError("Live baseline drift or health failure")
    free=free_kib if free_kib is not None else disk_available_kib()
    if free<5_500_000:raise ValueError("Insufficient disk for guarded deployment")
    compose_names={}
    for container,row in sorted(image_map.items()):
        if not isinstance(row,dict):raise ValueError("Invalid image entry")
        tag=row.get("tag","")
        identity=row.get("image_id","")
        if not IMAGE_TAG.fullmatch(tag) or not IMAGE_ID.fullmatch(identity):raise ValueError("Invalid immutable image reference")
        image=inspect_image(tag)
        if image.get("Id")!=identity:raise ValueError("Candidate image ID drift: "+container)
        labels=(image.get("Config") or {}).get("Labels") or {}
        if labels.get("org.opencontainers.image.revision")!=sha:
            raise ValueError("Candidate source-revision label mismatch: "+container)
        if labels.get("org.opencontainers.image.source")!=product["repository"]:
            raise ValueError("Candidate repository provenance missing: "+container)
        svc=service_name(container)
        if svc in compose_names:raise ValueError("Duplicate Compose service")
        compose_names[svc]={"image":tag}
    # Rollback tags are mutable: prove they still resolve to the pinned old IDs.
    for container,old in product["services"].items():
        expected=old.get("image_id")
        if not expected or inspect_image(old["image"]).get("Id")!=expected:
            raise ValueError("Rollback image is missing or tag points to different bytes: "+container)
    # An overlay is ONLY a prospective input; no secret material or resolved env is emitted.
    overlay={"services":compose_names}
    old={service_name(container):{"image":details["image"]} for container,details in product["services"].items()}
    return {
      "product":name,"source_revision":sha,"candidate_digest":candidate_digest(image_map),
      "ordered_compose_files":[f["path"] for f in product["compose_files"]],
      "candidate_overlay":overlay,"rollback_overlay":{"services":old},
      "backup_and_restore_required":True,
      "signed_ci_a3_revalidation_required":True,
      "authenticated_live_e2e_required":True,
      "independent_receipt_required":True,
      "automatic_deployment_permitted":False,
      "production_changed":False,
      "rehearsal_status":"STRUCTURAL_PREFLIGHT_PASSED"
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--registry",type=Path,default=REGISTRY)
    parser.add_argument("--request",required=True,type=Path)
    parser.add_argument("--candidate",required=True,type=Path)
    args=parser.parse_args()
    result=validate_candidate(json.loads(args.registry.read_text()),json.loads(args.request.read_text()),json.loads(args.candidate.read_text()))
    print(json.dumps(result,sort_keys=True,indent=2))
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except (ValueError,OSError,subprocess.TimeoutExpired,KeyError,json.JSONDecodeError) as exc:
        print(json.dumps({"rehearsal_status":"BLOCKED","reason":type(exc).__name__,"production_changed":False}),file=sys.stderr)
        sys.exit(2)
