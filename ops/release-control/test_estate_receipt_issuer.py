#!/usr/bin/env python3
"""Offline independent release-issuer tests; ephemeral signing keys only."""
import base64
import datetime as dt
import json
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat

from estate_release_intent import canonical
from estate_deploy_preflight import candidate_digest
import estate_receipt_issuer as issuer

NOW=dt.datetime(2026,10,22,8,15,tzinfo=dt.timezone.utc)
REPO="thatlango/lendflow"
SHA="a"*40
MERGE="b"*40
TREE="c"*40
BASE="d"*40
ROLLBACK="sha256:"+"e"*64
CHECKS=("ci","security","browser_e2e","permissions","live_health","live_user_journey","telemetry","rollback_ready")

def new_key():
    private=Ed25519PrivateKey.generate()
    return private,private.public_key().public_bytes(Encoding.PEM,PublicFormat.SubjectPublicKeyInfo)

def signed(payload,key,purpose):
    return {"purpose":purpose,"payload":payload,"signature":base64.urlsafe_b64encode(
       key.sign(canonical(payload))).rstrip(b"=").decode()}

def pr_get(repo,num):
    return {"state":"closed","merged":True,"base":{"ref":"main","repo":{"full_name":repo}},
            "head":{"sha":SHA},"merge_commit_sha":MERGE}

def commit_get(repo,sha):
    return {"sha":sha,"commit":{"tree":{"sha":TREE}}}

class IndependentReceiptTests(unittest.TestCase):
    def setUp(self):
        self.images={}
        self.actual={}
        for i,service in enumerate(("lendflow-api","lendflow-worker","lendflow-web")):
            iid="sha256:"+str(i+1)*64
            tag=service+":release-test"
            self.images[service]={"tag":tag,"image_id":iid}
            self.actual[service]={"Image":iid,"Config":{"Image":tag,"Labels":{
                "org.opencontainers.image.revision":SHA,
                "org.opencontainers.image.source":REPO}},
                "State":{"Running":True,"Health":{"Status":"healthy"}}}
        self.digest=candidate_digest(self.images)
        self.registry={"schema_version":1,"products":{"lendflow":{
            "repository":REPO,"mode":"release_control_candidate","release_risk":"financial_high",
            "automatic_deploy_enabled":False,
            "services":{s:{"image":m["tag"],"image_id":m["image_id"],"source_revision":SHA} for s,m in self.images.items()},
            "compose_files":[{"path":"/opt/tuku/platform/lendflow.compose.yml","sha256":"f"*64}],
            "health_urls":{"web":"https://lendflow.tukutuku.org/","api":"https://lendflow.tukutuku.org/api/v1/health/ready"}}}}
        self.request={"product":"lendflow","repository":REPO,"pr_number":85,
            "work_item_id":"work_01234567","source_revision":SHA,"merge_commit":MERGE,
            "source_tree":TREE,"artifact_digest":self.digest,"rollback_digest":ROLLBACK,
            "environment":"production","risk":"financial_high"}
        when=NOW.isoformat()
        self.ci={k:self.request[k] for k in ("repository","source_revision","merge_commit","source_tree","artifact_digest")}
        self.ci.update({"issued_at":when,"provider":"google-cloud-build","provider_run_id":"ci_run_123456789",
            "build_url":"https://console.cloud.google.com/cloud-build/builds/build123",
            "result":"passed","checks":{n:"passed" for n in ("build","integration","browser_e2e","security","tenant_permissions","financial","migration_compat","rollback_restore")}})
        self.a3={k:self.request[k] for k in ("product","repository","pr_number","work_item_id","source_revision","merge_commit","artifact_digest","risk","environment","rollback_digest")}
        self.a3.update({"issued_at":when,"result":"approved","policy":"A3","approval_ref":"a3_case_123456",
            "expires_at":(NOW+dt.timedelta(hours=12)).isoformat()})
        self.deploy={k:self.request[k] for k in ("product","repository","work_item_id","source_revision","merge_commit","artifact_digest","pr_number","rollback_digest")}
        self.deploy.update({"issued_at":when,"status":"live","artifact_type":"compose_image_set",
            "candidate":{"schema_version":1,"product":"lendflow","source_revision":SHA,"images":self.images},
            "production_url":"https://lendflow.tukutuku.org/",
            "base_sha":BASE,"deployed_at":(NOW-dt.timedelta(minutes=10)).isoformat(),
            "jakeos_dispatch":{"dispatch_id":"dispatch_abcdefghi","work_item_id":self.request["work_item_id"],"base_sha":BASE}})
        self.qa={k:self.request[k] for k in ("product","repository","work_item_id","source_revision","merge_commit","artifact_digest")}
        self.qa.update({"issued_at":when,"status":"passed","artifact_type":"compose_image_set",
            "image_set_digest":self.digest,"production_url":"https://lendflow.tukutuku.org/",
            "dispatch_id":"dispatch_abcdefghi","base_sha":BASE,
            "personas_verified":["owner","checker","cashier","borrower"],
            "checks":{c:"passed" for c in CHECKS}})
        self.signers=[new_key() for i in range(4)]
        self.issuer_private,_=new_key()
        self.probed=[]
    def run_issue(self,signer=True):
        envs=[
          signed(self.ci,self.signers[0][0],"tuku-pm-ci-v1"),
          signed(self.a3,self.signers[1][0],"tuku-pm-a3-v1"),
          signed(self.deploy,self.signers[2][0],"tuku-pm-deploy-v1"),
          signed(self.qa,self.signers[3][0],"tuku-pm-qa-v1")
        ]
        result=issuer.issue(self.registry,self.request,*envs,tuple(k[1] for k in self.signers),
            pr_get,commit_get,inspect=lambda name:self.actual[name],
            probe=lambda url:self.probed.append(url) or True,
            signer=self.issuer_private if signer else None,at=NOW)
        return result
    def test_full_independent_receipt_matches_all_three_immutable_images(self):
        obj=self.run_issue()
        receipt=obj["production_receipt"]
        self.assertEqual(receipt["deployment"]["artifact_type"],"compose_image_set")
        self.assertEqual(receipt["deployment"]["artifact_digest"],self.digest)
        self.assertEqual(receipt["work_item_id"],self.request["work_item_id"])
        self.assertEqual(receipt["release_sha"],MERGE)
        self.assertEqual(len(self.probed),2)
        self.issuer_private.public_key().verify(base64.urlsafe_b64decode(obj["production_signature"]+"=="),canonical(receipt))
    def test_changed_worker_image_is_rejected(self):
        self.actual["lendflow-worker"]["Image"]="sha256:"+"9"*64
        with self.assertRaisesRegex(ValueError,"image ID/tag"):self.run_issue()
    def test_missing_worker_is_rejected(self):
        self.deploy["candidate"]["images"].pop("lendflow-worker")
        with self.assertRaisesRegex(ValueError,"container set"):self.run_issue()
    def test_wrong_production_host_is_rejected(self):
        self.deploy["production_url"]="https://wrong.tukutuku.org/"
        with self.assertRaisesRegex(ValueError,"host mismatch"):self.run_issue()
    def test_qa_must_verify_checker_and_cashier_roles(self):
        self.qa["personas_verified"]=["owner"]
        with self.assertRaisesRegex(ValueError,"role journeys"):self.run_issue()
    def test_qa_must_bind_exact_image_set(self):
        self.qa["image_set_digest"]=ROLLBACK
        with self.assertRaisesRegex(ValueError,"image set"):self.run_issue()
    def test_qa_requires_full_live_e2e(self):
        self.qa["checks"]["live_user_journey"]="missing"
        with self.assertRaisesRegex(ValueError,"mandatory checks"):self.run_issue()
    def test_ci_failure_blocks_receipt(self):
        self.ci["checks"]["financial"]="failed"
        with self.assertRaisesRegex(ValueError,"financial"):self.run_issue()
    def test_expired_approval_blocks_receipt(self):
        self.a3["expires_at"]=(NOW-dt.timedelta(minutes=1)).isoformat()
        with self.assertRaisesRegex(ValueError,"Approval expired"):self.run_issue()
    def test_mismatched_work_binding_blocks_receipt(self):
        self.qa["dispatch_id"]="dispatch_someone_else"
        with self.assertRaisesRegex(ValueError,"JakeOS Work"):self.run_issue()
    def test_issuer_cannot_sign_without_separate_identity(self):
        with self.assertRaisesRegex(ValueError,"issuer unavailable"):self.run_issue(signer=False)
    def test_unregistered_product_never_issues(self):
        self.request["product"]="unknown"
        with self.assertRaisesRegex(ValueError,"Unregistered product"):self.run_issue()
    def test_unsigned_or_tampered_qa_is_rejected(self):
        envs=[
          signed(self.ci,self.signers[0][0],"tuku-pm-ci-v1"),
          signed(self.a3,self.signers[1][0],"tuku-pm-a3-v1"),
          signed(self.deploy,self.signers[2][0],"tuku-pm-deploy-v1"),
          signed(self.qa,self.signers[3][0],"tuku-pm-qa-v1")
        ]
        envs[-1]["payload"]["status"]="failed"
        with self.assertRaisesRegex(ValueError,"Signature verification failed"):
            issuer.issue(self.registry,self.request,*envs,tuple(k[1] for k in self.signers),
                pr_get,commit_get,inspect=lambda name:self.actual[name],
                probe=lambda url:True,signer=self.issuer_private,at=NOW)

if __name__=="__main__":unittest.main(verbosity=2)
