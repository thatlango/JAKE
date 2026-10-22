#!/usr/bin/env python3
"""Read-only, fail-closed production baseline/drift check across Tuku products.

An observed Docker image is NOT proof that its source was independently built.
This checker never deploys, merges, signs, approves or alters containers.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT=Path("/opt/tuku/work/tuku-autonomy/release-control")
REGISTRY=ROOT/"registry.json"
NAMES=re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,90}$")
HEX64=re.compile(r"^[0-9a-f]{64}$")
SHA40=re.compile(r"^[0-9a-f]{40}$")

def command(parts, timeout=16):
    out=subprocess.run(parts,check=False,capture_output=True,text=True,timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError("Read-only command failed: "+parts[0]+":"+parts[1]+" (exit "+str(out.returncode)+")")
    return out.stdout.strip()

def validate(registry):
    if not isinstance(registry,dict) or registry.get("schema_version")!=1: raise ValueError("Unsupported registry schema")
    products=registry.get("products")
    if not isinstance(products,dict) or not products: raise ValueError("Empty product registry")
    for key,p in products.items():
        if not NAMES.fullmatch(key):raise ValueError("Invalid product ID")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",p.get("repository","")):raise ValueError("Invalid repository")
        if p.get("mode") not in ("observed_only","release_control_candidate"):raise ValueError("Unknown product mode")
        if not isinstance(p.get("services"),dict) or not p["services"]:raise ValueError("Missing services")
        if not isinstance(p.get("compose_files"),list) or not p["compose_files"]:raise ValueError("Missing ordered Compose files")
        for f in p["compose_files"]:
            if not isinstance(f,dict) or not str(f.get("path","")).startswith("/opt/tuku/") or not HEX64.fullmatch(f.get("sha256","")):
                raise ValueError("Bad Compose baseline")
        for name,data in p["services"].items():
            if not NAMES.fullmatch(name) or not isinstance(data,dict):raise ValueError("Invalid service")
            if not str(data.get("image","")).strip():raise ValueError("Missing service image")
            digest=data.get("image_id")
            if digest is not None and not re.fullmatch(r"sha256:[0-9a-f]{64}",digest):raise ValueError("Invalid image ID")
            revision=data.get("source_revision")
            if revision is not None and not SHA40.fullmatch(revision):raise ValueError("Invalid source revision")
    return products

def inspect(name):
    if not NAMES.fullmatch(name):raise ValueError("Invalid Docker name")
    return json.loads(command(["sudo","docker","inspect",name,"--format","{{json .}}"],timeout=20))

def filehash(path):
    if not path.startswith("/opt/tuku/") or "\n" in path:raise ValueError("Invalid baseline path")
    output=command(["sudo","sha256sum",path])
    digest=output.split()[0]
    if not HEX64.fullmatch(digest):raise ValueError("Bad content hash")
    return digest

def disk_available_kib():
    rows=command(["df","-Pk","/"]).splitlines()
    return int(rows[-1].split()[3])

def probe(url):
    if not isinstance(url,str) or not url.startswith("https://") or "@" in url or not re.fullmatch(r"https://[a-z0-9.-]+(?:/[A-Za-z0-9_./-]*)?",url):
        raise ValueError("Invalid HTTPS health URL")
    req=urllib.request.Request(url,headers={"User-Agent":"Tuku-PM-ReadOnly-Drift-Guard/1"})
    with urllib.request.urlopen(req,timeout=12) as response:
        return response.status

def evaluate_product(name, product, with_probes=False):
    issues=[]
    warnings=[]
    active_config=None
    for svc,expected in product["services"].items():
        try:
            actual=inspect(svc)
            conf=actual.get("Config") or {}
            state=actual.get("State") or {}
            labels=conf.get("Labels") or {}
            if not state.get("Running"):issues.append(svc+":not_running")
            if conf.get("Image")!=expected.get("image"):issues.append(svc+":image_tag_changed")
            if expected.get("image_id") and actual.get("Image")!=expected["image_id"]:issues.append(svc+":image_id_changed")
            rev=labels.get("org.opencontainers.image.revision")
            if expected.get("source_revision") and rev!=expected["source_revision"]:issues.append(svc+":revision_mismatch")
            if not rev:warnings.append(svc+":missing_revision_provenance")
            source=labels.get("org.opencontainers.image.source")
            if expected.get("source_revision") and source!=product["repository"]:issues.append(svc+":repository_label_mismatch")
            health=(state.get("Health") or {}).get("Status")
            if health and health!="healthy":issues.append(svc+":health_"+health)
            comp=[p for p in labels.get("com.docker.compose.project.config_files","").split(",") if p]
            if not comp: warnings.append(svc+":missing_compose_labels")
            elif active_config is None: active_config=comp
            elif comp!=active_config:issues.append(svc+":compose_file_order_differs")
        except (RuntimeError,ValueError,KeyError,subprocess.TimeoutExpired,JSONDecodeError) as exc:
            issues.append(svc+":inspect_unavailable_"+type(exc).__name__)
    expected_files=[f["path"] for f in product["compose_files"]]
    if active_config is not None and active_config!=expected_files:issues.append("compose_file_order_changed")
    for f in product["compose_files"]:
        try:
            if filehash(f["path"])!=f["sha256"]: issues.append("compose_content_changed:"+f["path"])
        except (RuntimeError,ValueError,subprocess.TimeoutExpired):
            issues.append("compose_file_unreadable:"+f["path"])
    if with_probes:
        for key,url in product.get("health_urls",{}).items():
            try:
                if probe(url)!=200:issues.append("health_probe_failed:"+key)
            except (RuntimeError,ValueError,urllib.error.URLError,TimeoutError):
                issues.append("health_probe_unavailable:"+key)
    if product["mode"]=="observed_only":warnings.append("product_not_eligible_for_automatic_release")
    if not product.get("independent_signed_ci"):warnings.append("independent_signed_ci_not_connected")
    if not product.get("independent_receipt_issuer"):warnings.append("independent_receipt_not_connected")
    return {"product":name,"status":"drift" if issues else ("monitor_only" if product["mode"]=="observed_only" else "baseline_healthy"),"issues":sorted(set(issues)),"warnings":sorted(set(warnings)),"release_authorised":False}

# Python JSON uses JSONDecodeError and is intentionally handled as a known inspection exception.
JSONDecodeError=json.JSONDecodeError

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--registry",type=Path,default=REGISTRY)
    parser.add_argument("--product",default="all")
    parser.add_argument("--probe",action="store_true")
    parser.add_argument("--report-file",type=Path)
    args=parser.parse_args()
    products=validate(json.loads(args.registry.read_text()))
    if args.product!="all" and args.product not in products:parser.error("Unknown product")
    selected=products if args.product=="all" else {args.product:products[args.product]}
    results=[evaluate_product(name,p,args.probe) for name,p in selected.items()]
    free=disk_available_kib()
    if free < 5_500_000:
        results.append({"product":"host","status":"drift","issues":["root_disk_below_5_5GB"],"warnings":[],"release_authorised":False})
    result={"schema_version":1,"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"root_disk_available_kib":free,"results":results,"safe_to_attempt_release":False,"production_changed":False}
    encoded=json.dumps(result,sort_keys=True,indent=2)+"\n"
    if args.report_file:
        if not args.report_file.resolve().is_relative_to(ROOT.resolve()):raise ValueError("Report path outside control root")
        args.report_file.parent.mkdir(parents=True,exist_ok=True)
        temp=args.report_file.with_suffix(".json.tmp")
        temp.write_text(encoded)
        os.replace(temp,args.report_file)
    print(encoded,end="")
    if any(item["status"]=="drift" for item in results):return 2
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except (ValueError,OSError,subprocess.TimeoutExpired,json.JSONDecodeError) as exc:
        print(json.dumps({"status":"error","reason":type(exc).__name__,"release_authorised":False,"production_changed":False}),file=sys.stderr)
        sys.exit(3)
