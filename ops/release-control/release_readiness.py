#!/usr/bin/env python3
"""Fail-closed, read-only release-readiness report. Never authorizes deployment."""
import argparse, json
from datetime import datetime, timezone
from pathlib import Path

AUTHORITIES=("ci","a3","deploy","qa","receipt")

def assess(registry, controls, free_gib):
    findings=[]
    def check(name, passed, reason):
        findings.append({"check":name,"passed":bool(passed),"reason":reason})
    minimum=controls.get("required_free_gib",20)
    check("disk",free_gib>=minimum,f"available {free_gib:.2f} GiB; minimum {minimum} GiB")
    authorities=controls.get("authorities",{})
    for name in AUTHORITIES:
        record=authorities.get(name,{})
        check("signer:"+name, bool(record.get("active") and record.get("operator") and record.get("fingerprint")), "distinct authorized operator and public-key fingerprint required; no private keys in report")
    check("independent_ci",controls.get("independent_ci",{}).get("verified") is True,"independent exact-source/image attestations required")
    check("rollback_restore",controls.get("restore_drill",{}).get("verified") is True,"actual restore test required")
    check("authenticated_acceptance",controls.get("production_acceptance",{}).get("verified") is True,"independent live role-based journey proof required")
    for name,product in registry.get("products",{}).items():
        check(name+":baseline",bool(product.get("services") and product.get("compose_files")),"registered image and Compose baseline required")
        check(name+":enabled",product.get("mode")=="release_control_candidate" and product.get("automatic_deploy_enabled") is True,"operator activation required; never auto-enable")
    return {"schema_version":1,"time_utc":datetime.now(timezone.utc).isoformat(),"ready":all(x["passed"] for x in findings),"findings":findings}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--registry",type=Path,required=True)
    p.add_argument("--controls",type=Path,required=True)
    p.add_argument("--free-gib",type=float,required=True)
    a=p.parse_args()
    result=assess(json.loads(a.registry.read_text()),json.loads(a.controls.read_text()),a.free_gib)
    print(json.dumps(result,indent=2))
    return 0 if result["ready"] else 2

if __name__=="__main__":raise SystemExit(main())
