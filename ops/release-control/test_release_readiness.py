import unittest
from release_readiness import assess

class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.registry={"products":{"jakeos":{"mode":"release_control_candidate","automatic_deploy_enabled":True,"services":{"web":{}},"compose_files":[{"path":"/example"}]}}}
        self.controls={"required_free_gib":10,"authorities":{name:{"active":True,"operator":name,"fingerprint":"SHA256:"+name} for name in ("ci","a3","deploy","qa","receipt")},"independent_ci":{"verified":True},"restore_drill":{"verified":True},"production_acceptance":{"verified":True}}
    def test_all_valid(self):
        self.assertTrue(assess(self.registry,self.controls,12)["ready"])
    def test_disk_failure(self):
        self.assertFalse(assess(self.registry,self.controls,9)["ready"])
    def test_missing_signer(self):
        del self.controls["authorities"]["qa"]
        self.assertFalse(assess(self.registry,self.controls,12)["ready"])
    def test_unapproved_activation(self):
        self.registry["products"]["jakeos"]["automatic_deploy_enabled"]=False
        self.assertFalse(assess(self.registry,self.controls,12)["ready"])
    def test_reused_fingerprint(self):
        self.controls["authorities"]["qa"]["fingerprint"]=self.controls["authorities"]["ci"]["fingerprint"]
        self.assertFalse(assess(self.registry,self.controls,12)["ready"])
    def test_empty_registry(self):
        self.registry["products"]={}
        self.assertFalse(assess(self.registry,self.controls,12)["ready"])
    def test_no_independent_ci(self):
        self.controls["independent_ci"]["verified"]=False
        self.assertFalse(assess(self.registry,self.controls,12)["ready"])

if __name__=="__main__":unittest.main()
