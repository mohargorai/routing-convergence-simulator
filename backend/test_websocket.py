"""
Live WebSocket Communication Test for Routing Convergence Simulator.
"""
import asyncio
import json
import unittest
from starlette.testclient import TestClient
from backend.server import app


class TestWebSocketStream(unittest.TestCase):
    def test_websocket_connect_and_broadcast(self):
        client = TestClient(app)
        with client.websocket_connect("/ws") as websocket:
            # 1. First message received upon connect should be full state
            data = websocket.receive_json()
            self.assertIn("topology", data)
            self.assertIn("active_telemetry", data)
            self.assertIn("protocol", data)

            # 2. Send step action
            websocket.send_json({"action": "step"})
            response = websocket.receive_json()
            self.assertIn("active_telemetry", response)
            self.assertGreaterEqual(response["active_telemetry"]["tick"], 0)

            # 3. Send toggle link action
            websocket.send_json({"action": "toggle_link", "u": "A", "v": "B"})
            response2 = websocket.receive_json()
            link_ab = next(
                (l for l in response2["topology"]["links"] if l["id"] == "A--B"), None
            )
            self.assertIsNotNone(link_ab)
            self.assertEqual(link_ab["status"], "down")

            # 4. Toggle back up
            websocket.send_json({"action": "toggle_link", "u": "A", "v": "B"})
            response3 = websocket.receive_json()
            link_ab_up = next(
                (l for l in response3["topology"]["links"] if l["id"] == "A--B"), None
            )
            self.assertEqual(link_ab_up["status"], "up")


if __name__ == "__main__":
    unittest.main()

