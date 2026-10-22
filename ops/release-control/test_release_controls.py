#!/usr/bin/env python3
"""Isolated regression tests: zero production writes, ephemeral Ed25519 keys."""
import base64
import datetime as dt
import hashlib
import json
import sys
import unittest
from unittest import mock

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat

import estate_release_guard as guard
import estate_release_intent as gate

SHA="a"*40
MERGE="b"*40
TREE="c"*40
DIGEST="sha256:"+"d"*64
ROLLBACK="sha256:"+"e"*64
NOW=dt.datetime(2026,10,22,6,0,tzinfo=dt.timezone.utc)
REPO="thatlango/lendflow"

def keys():
    key=Ed25519PrivateKey.generate()
    return key,key.public_key().public_bytes(Encoding.PEM,PublicFormat.SubjectPublicKeyInfo)

def envelope(payload,private,purpose):
    sign=private.sign(gate.canonical(payload))
    return {"purpose":purpose,"payload":payload,"signature":base64.urlsafe_b64encode(sign).rstrip(b"=").decode()}

def fixture():
    registry={"schema_version":1,"products":{"lendflow":{
        "repository":REPO,"mode":"release_control_candidate","release_risk":"financial_high","automatic_deploy_enabled":False,
        "services":{"lendflow-api":{"image":"lendflow-api:v3","image_id":"sha256:"+"1"*64,"source_revision":SHA}},
        "compose_files":[{"path":"/opt/tuku/platform/lendflow.compose.yml","sha256":"2"*64}]}}}
    req={"product":"lendflow","repository":REPO,"pr_number":85,"work_item_id":"work_01234567",
       "source_revision":SHA,"merge_commit":MERGE,"source_tree":TREE,"artifact_digest":DIGEST,
       "rollback_digest":ROLLBACK,"environment":"production","risk":"financial_high"}
    ci={k:req[k] for k in ("repository","source_revision","merge_commit","source_tree","artifact_digest")}
    ci.update({"issued_at":NOW.isoformat(),"provider":"google-cloud-build","provider_run_id":"ci_run_123456789",
        "result":"passed","checks":{name:"passed" for name in gate.REQUIRED_CI_CHECKS}})
    approval={k:req[k] for k in ("product","repository","pr_number","work_item_id","source_revision","merge_commit","artifact_digest","risk","environment","rollback_digest")}
    approval.update({"issued_at":NOW.isoformat(),"result":"approved","policy":"A3","expires_at":(NOW+dt.timedelta(hours=12)).isoformat()})
    ck,cp=keys()
    ak,ap=keys()
    return registry,req,ci,approval,ck,cp,ak,ap

def pr_get(repo,num):
    return {"state":"closed","merged":True,"base":{"repo":{"full_name":repo},"ref":"main"},
            "head":{"sha":SHA},"merge_commit_sha":MERGE}

def commit_get(repo,sha):
    return {"sha":sha,"commit":{"tree":{"sha":TREE}}}

def execute(registry,req,ci,approval,ck,cp,ak,ap,pr_fn=pr_get):
    return gate.evaluate(registry,req,envelope(ci,ck,gate.PURPOSE_CI),envelope(approval,ak,gate.PURPOSE_APPROVAL),cp,ap,pr_fn,commit_get,now=NOW)

class SignedReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.r,self.req,self.ci,self.ap,self.ck,self.cp,self.ak,self.pub=fixture()
    def go(self,pr_fn=pr_get):
        return execute(self.r,self.req,self.ci,self.ap,self.ck,self.cp,self.ak,self.pub,pr_fn)
    def test_exact_source_ci_and_a3_generates_intent_without_deployment(self):
        result=self.go()
        self.assertEqual(result["source_tree"],TREE)
        self.assertFalse(result["deployment_permitted"])
        self.assertFalse(result["production_changed"])
    def test_tampered_ci_signature_blocked(self):
        env=envelope(self.ci,self.ck,gate.PURPOSE_CI)
        env["payload"]["artifact_digest"]="sha256:"+"0"*64
        with self.assertRaisesRegex(ValueError,"Signature verification"):
            gate.verify(env,self.cp,gate.PURPOSE_CI)
    def test_missing_financial_evidence_blocked(self):
        self.ci["checks"]["financial"]="pending"
        with self.assertRaisesRegex(ValueError,"financial"):self.go()
    def test_browser_e2e_missing_blocked(self):
        self.ci["checks"].pop("browser_e2e")
        with self.assertRaisesRegex(ValueError,"browser_e2e"):self.go()
    def test_wrong_risk_authority_blocked(self):
        self.ap["risk"]="routine"
        with self.assertRaisesRegex(ValueError,"A3 does not bind"):self.go()
    def test_expired_approval_blocked(self):
        self.ap["expires_at"]=(NOW-dt.timedelta(seconds=1)).isoformat()
        with self.assertRaisesRegex(ValueError,"Approval expired"):self.go()
    def test_wrong_merge_tree_blocked(self):
        def mismatch(repo,sha):return {"sha":sha,"commit":{"tree":{"sha":"f"*40}}}
        with self.assertRaisesRegex(ValueError,"source tree not exact"):
            gate.evaluate(self.r,self.req,envelope(self.ci,self.ck,gate.PURPOSE_CI),
                envelope(self.ap,self.ak,gate.PURPOSE_APPROVAL),self.cp,self.pub,pr_get,mismatch,now=NOW)
    def test_unmerged_pr_blocked(self):
        def unmerged(repo,num): return dict(pr_get(repo,num),merged=False)
        with self.assertRaisesRegex(ValueError,"not merged"):self.go(unmerged)
    def test_observation_only_blocked(self):
        self.r["products"]["lendflow"]["mode"]="observed_only"
        with self.assertRaisesRegex(ValueError,"observation-only"):self.go()
    def test_old_ci_blocked(self):
        self.ci["issued_at"]=(NOW-dt.timedelta(days=3)).isoformat()
        with self.assertRaisesRegex(ValueError,"Stale"):self.go()
    def test_unregistered_repo_blocked(self):
        self.req["repository"]="someone-else/repo"
        with self.assertRaisesRegex(ValueError,"Repository mismatch"):self.go()

class DriftGuardTests(unittest.TestCase):
    def setUp(self):
        self.baseline={
            "repository":REPO,"mode":"release_control_candidate",
            "services":{"lendflow-api":{"image":"lendflow-api:v3","image_id":"sha256:"+"1"*64,"source_revision":SHA}},
            "compose_files":[{"path":"/opt/tuku/platform/lendflow.compose.yml","sha256":"2"*64}],
            "independent_signed_ci":False,"independent_receipt_issuer":False}
        self.raw={"Config":{"Image":"lendflow-api:v3","Labels":{
            "org.opencontainers.image.revision":SHA,
            "org.opencontainers.image.source":REPO,
            "com.docker.compose.project.config_files":"/opt/tuku/platform/lendflow.compose.yml"}},
            "State":{"Running":True,"Health":{"Status":"healthy"}},"Image":"sha256:"+"1"*64}
    def run_guard(self):
        with mock.patch.object(guard,"inspect",return_value=self.raw),mock.patch.object(guard,"filehash",return_value="2"*64):
            return guard.evaluate_product("lendflow",self.baseline)
    def test_healthy_observed_baseline_does_not_authorise_release(self):
        result=self.run_guard()
        self.assertEqual(result["status"],"baseline_healthy")
        self.assertFalse(result["release_authorised"])
    def test_unauthorised_image_change_detected(self):
        self.raw["Image"]="sha256:"+"9"*64
        self.assertIn("lendflow-api:image_id_changed",self.run_guard()["issues"])
    def test_source_label_drift_detected(self):
        self.raw["Config"]["Labels"]["org.opencontainers.image.revision"]="f"*40
        self.assertIn("lendflow-api:revision_mismatch",self.run_guard()["issues"])
    def test_compose_changed_detected(self):
        with mock.patch.object(guard,"inspect",return_value=self.raw),mock.patch.object(guard,"filehash",return_value="f"*64):
            self.assertTrue(any("compose_content_changed" in x for x in guard.evaluate_product("lendflow",self.baseline)["issues"]))
    def test_missing_revision_provenance_visible(self):
        self.raw["Config"]["Labels"].pop("org.opencontainers.image.revision")
        self.assertIn("lendflow-api:missing_revision_provenance",self.run_guard()["warnings"])
    def test_bad_image_id_registry_rejected(self):
        self.baseline["services"]["lendflow-api"]["image_id"]="garbage"
        with self.assertRaises(ValueError):
            guard.validate({"schema_version":1,"products":{"lendflow":self.baseline}})

if __name__=="__main__":unittest.main(verbosity=2)
