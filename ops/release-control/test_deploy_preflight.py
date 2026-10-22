#!/usr/bin/env python3
import unittest
from unittest import mock
import estate_deploy_preflight as d

SHA="a"*40
REPO="thatlango/lendflow"
OLD="sha256:"+"1"*64
NEW="sha256:"+"2"*64
TAG="lendflow-api:releasecandidate"
OLD_TAG="lendflow-api:previous"
COMPOSE="/opt/tuku/platform/lendflow.compose.yml"

class RehearsalTests(unittest.TestCase):
    def setUp(self):
        self.registry={"schema_version":1,"products":{"lendflow":{
            "repository":REPO,"mode":"release_control_candidate","release_risk":"financial_high",
            "services":{"lendflow-api":{"image":OLD_TAG,"image_id":OLD,"source_revision":SHA}},
            "compose_files":[{"path":COMPOSE,"sha256":"3"*64}]}}}
        self.candidate={"schema_version":1,"product":"lendflow","source_revision":SHA,
            "images":{"lendflow-api":{"tag":TAG,"image_id":NEW}}}
        self.request={"product":"lendflow","repository":REPO,"source_revision":SHA,
                      "artifact_digest":d.candidate_digest(self.candidate["images"])}
        self.new={"Id":NEW,"Config":{"Labels":{"org.opencontainers.image.revision":SHA,
                    "org.opencontainers.image.source":REPO}}}
        self.old={"Id":OLD,"Config":{"Labels":{}}}
    def verify(self,inspect_image=None,**kwargs):
        def image(tag):return {TAG:self.new,OLD_TAG:self.old}[tag]
        return d.validate_candidate(self.registry,self.request,self.candidate,inspect_image=inspect_image or image,
            service_name=lambda container:"api",live_status={"status":"baseline_healthy"},free_kib=8_000_000,**kwargs)
    def test_normal_rehearsal_contains_only_expected_overlays_and_never_deploys(self):
        result=self.verify()
        self.assertEqual(result["rehearsal_status"],"STRUCTURAL_PREFLIGHT_PASSED")
        self.assertEqual(result["candidate_overlay"]["services"]["api"]["image"],TAG)
        self.assertEqual(result["rollback_overlay"]["services"]["api"]["image"],OLD_TAG)
        self.assertFalse(result["production_changed"])
        self.assertFalse(result["automatic_deployment_permitted"])
    def test_wrong_artifact_manifest_digest_rejected(self):
        self.request["artifact_digest"]="sha256:"+"9"*64
        with self.assertRaisesRegex(ValueError,"digest"):self.verify()
    def test_missing_immutable_image_rejected(self):
        self.candidate["images"]["lendflow-api"]["image_id"]="none"
        self.request["artifact_digest"]=d.candidate_digest(self.candidate["images"])
        with self.assertRaisesRegex(ValueError,"immutable"):self.verify()
    def test_image_tag_digest_changed_rejected(self):
        self.new["Id"]="sha256:"+"8"*64
        with self.assertRaisesRegex(ValueError,"image ID drift"):self.verify()
    def test_source_revision_mismatch_rejected(self):
        self.new["Config"]["Labels"]["org.opencontainers.image.revision"]="f"*40
        with self.assertRaisesRegex(ValueError,"source-revision"):self.verify()
    def test_repo_source_mismatch_rejected(self):
        self.new["Config"]["Labels"]["org.opencontainers.image.source"]="other/repo"
        with self.assertRaisesRegex(ValueError,"provenance"):self.verify()
    def test_stale_rollback_tag_rejected(self):
        self.old["Id"]="sha256:"+"8"*64
        with self.assertRaisesRegex(ValueError,"Rollback image"):self.verify()
    def test_live_drift_rejected(self):
        with self.assertRaisesRegex(ValueError,"Live baseline drift"):
            d.validate_candidate(self.registry,self.request,self.candidate,
                inspect_image=lambda tag:self.new,service_name=lambda name:"api",
                live_status={"status":"drift"},free_kib=8_000_000)
    def test_disk_guard_rejected(self):
        with self.assertRaisesRegex(ValueError,"Insufficient disk"):
            d.validate_candidate(self.registry,self.request,self.candidate,
                inspect_image=lambda tag:self.new,service_name=lambda name:"api",
                live_status={"status":"baseline_healthy"},free_kib=100_000)
    def test_additional_unapproved_container_rejected(self):
        self.candidate["images"]["unapproved"]={"tag":TAG,"image_id":NEW}
        self.request["artifact_digest"]=d.candidate_digest(self.candidate["images"])
        with self.assertRaisesRegex(ValueError,"All and only"):self.verify()

if __name__=="__main__":unittest.main(verbosity=2)
