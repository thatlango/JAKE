import tempfile
import subprocess
import unittest
from pathlib import Path

import estate_deploy_adapter as d

SHA="a"*40
NEW="sha256:"+"2"*64
OLD="sha256:"+"1"*64

class ComposeAdapterTests(unittest.TestCase):
 def setUp(self):
  self.product={"repository":"thatlango/lendflow",
   "services":{"lendflow-api":{"image":"lendflow-api:prior","image_id":OLD}},
   "compose_files":[{"path":"/opt/tuku/platform/lendflow.compose.yml","sha256":"f"*64}],
   "health_urls":{"web":"https://lendflow.tukutuku.org/"}}
  self.plan={"source_revision":SHA,
   "candidate_overlay":{"services":{"api":{"image":"lendflow-api:new"}}},
   "rollback_overlay":{"services":{"api":{"image":"lendflow-api:prior"}}}}
  self.candidate={"images":{"lendflow-api":{"tag":"lendflow-api:new","image_id":NEW}}}
  self.current="prior"
  self.calls=[]
  self.failure=False
  self.rollback_broken=False
 def inspect(self,container):
  if self.current=="new":
   sha="f"*40 if self.failure else SHA
   return {"Image":NEW,"Config":{"Image":"lendflow-api:new","Labels":{"org.opencontainers.image.revision":sha}},
           "State":{"Running":True,"Health":{"Status":"healthy"}}}
  if self.current=="old-broken":
   return {"Image":NEW,"Config":{"Image":"lendflow-api:prior","Labels":{}},"State":{"Running":True}}
  return {"Image":OLD,"Config":{"Image":"lendflow-api:prior","Labels":{}},
          "State":{"Running":True,"Health":{"Status":"healthy"}}}
 def runner(self,args,timeout):
  self.calls.append(args)
  if args[-1]=="api" and "up" in args:
   image=args[args.index("-f",4)+1] if False else ""
   overlay=next((x for x in args if x.endswith("candidate.compose.json") or x.endswith("rollback.compose.json")),None)
   if overlay and overlay.endswith("candidate.compose.json"):
    self.current="new"
   if overlay and overlay.endswith("rollback.compose.json"):
    self.current="old-broken" if self.rollback_broken else "prior"
  return subprocess.CompletedProcess(args,0,stdout="",stderr="")
 def execute(self,root):
  return d.perform_cutover(self.product,self.plan,self.candidate,root,runner=self.runner,
          read_container=self.inspect,probe=lambda url:True,sleeper=lambda n:None)
 def test_release_applies_explicit_services_and_verifies_exact_image(self):
  with tempfile.TemporaryDirectory() as tmp:
   result=self.execute(Path(tmp)/"release")
   self.assertEqual(result["cutover_status"],"verified_live")
   self.assertEqual(self.current,"new")
   self.assertTrue(any(c[-2:]==["config","--quiet"] for c in self.calls))
   self.assertEqual(len([c for c in self.calls if "up" in c]),1)
 def test_bad_new_image_triggers_rollback_to_exact_original(self):
  self.failure=True
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaisesRegex(ValueError,"revision mismatch"):self.execute(Path(tmp)/"release")
   self.assertEqual(self.current,"prior")
   self.assertEqual(len([c for c in self.calls if "up" in c]),2)
 def test_rollback_image_tamper_is_detected_even_if_service_healthy(self):
  self.failure=True
  self.rollback_broken=True
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaisesRegex(RuntimeError,"CRITICAL rollback attempt failed"):self.execute(Path(tmp)/"release")
   self.assertEqual(self.current,"old-broken")
 def test_post_evidence_failure_reinstalls_original_digests(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/"release"
   self.execute(root)
   self.assertTrue(d.rollback_after_failed_evidence(self.product,root,
          runner=self.runner,read_container=self.inspect,probe=lambda url:True,sleeper=lambda n:None))
   self.assertEqual(self.current,"prior")
 def test_reject_wrong_original_image_id(self):
  fake=self.inspect("lendflow-api")
  fake["Image"]="sha256:"+"9"*64
  with self.assertRaisesRegex(ValueError,"immutable rollback"):
   d.verify_rollback(self.product,read_container=lambda n:fake)
 def test_compose_arguments_are_bounded_to_base_overlay_and_selected_service(self):
  command=d.compose_args(self.product,Path("/tmp/compose-test.json"),["api"])
  self.assertEqual(command[:2],["docker","compose"])
  self.assertEqual(command[-6:],["up","-d","--no-build","--no-deps","--force-recreate","api"])
  self.assertNotIn("sh",command)
 def test_unsupported_product_has_no_backup_driver(self):
  with self.assertRaisesRegex(ValueError,"No reviewed backup driver"):
   d.backup_and_prove_restore("unknown",Path("/tmp/does-not-exist"))

if __name__=="__main__":unittest.main(verbosity=2)
