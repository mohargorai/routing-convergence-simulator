"""
End-to-End API and Server Integration Tests for Routing Convergence Simulator.
"""
import sys
import unittest
from starlette.testclient import TestClient
from backend.server import app, coordinator


class TestServerAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_status_endpoint(self):
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "online")
        self.assertIn("protocol", data)
        self.assertIn("mininet", data)

    def test_state_endpoint(self):
        res = self.client.get("/api/state")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("topology", data)
        self.assertIn("active_telemetry", data)
        self.assertIn("ls_telemetry", data)
        self.assertIn("dv_telemetry", data)

    def test_step_and_protocol_switching(self):
        # Step LS
        res = self.client.post("/api/simulation/protocol", json={"protocol": "LS"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["protocol"], "LS")

        res_step = self.client.post("/api/simulation/step")
        self.assertEqual(res_step.status_code, 200)

        # Switch to DV
        res_dv = self.client.post("/api/simulation/protocol", json={"protocol": "DV"})
        self.assertEqual(res_dv.status_code, 200)
        self.assertEqual(res_dv.json()["protocol"], "DV")

        # Set DV options
        res_opts = self.client.post(
            "/api/simulation/dv-options",
            json={"split_horizon": True, "poison_reverse": True, "infinity_metric": 16},
        )
        self.assertEqual(res_opts.status_code, 200)

    def test_topology_mutations_api(self):
        # Load Diamond preset
        res_preset = self.client.post("/api/topology/preset", json={"preset": "diamond"})
        self.assertEqual(res_preset.status_code, 200)
        self.assertEqual(res_preset.json()["preset_name"], "diamond")

        # Edit link cost A--B
        res_cost = self.client.post("/api/topology/link/cost", json={"u": "A", "v": "B", "cost": 7})
        self.assertEqual(res_cost.status_code, 200)
        self.assertEqual(res_cost.json()["cost"], 7)

        # Toggle link A--B
        res_toggle = self.client.post("/api/topology/link/toggle", json={"u": "A", "v": "B"})
        self.assertEqual(res_toggle.status_code, 200)
        self.assertEqual(res_toggle.json()["status"], "down")

        # Toggle back up
        res_toggle_up = self.client.post("/api/topology/link/toggle", json={"u": "A", "v": "B"})
        self.assertEqual(res_toggle_up.status_code, 200)
        self.assertEqual(res_toggle_up.json()["status"], "up")

    def test_comparison_endpoint(self):
        res = self.client.get("/api/simulation/compare")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("link_state", data)
        self.assertIn("distance_vector", data)
        self.assertIn("verdict", data)

    def test_mininet_ping_api(self):
        res = self.client.post("/api/mininet/ping", json={"src": "A", "dst": "B"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])

    def test_static_frontend_serving(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("<div id=\"root\">", res.text)


if __name__ == "__main__":
    unittest.main()

