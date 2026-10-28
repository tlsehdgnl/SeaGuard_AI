import os
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from app.main import app, analyze, validate_values

class SeaGuardTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.env = patch.dict(os.environ, {"LLM_API_KEY": "", "LLM_API_URL": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_demo_all_beaches_and_provenance(self):
        for beach, expected in [("mangsang", "low"), ("chuam", "caution"), ("eodal", "danger")]:
            with self.subTest(beach=beach):
                r = self.client.get(f"/api/risk/{beach}")
                self.assertEqual(r.status_code, 200)
                data = r.json()
                self.assertEqual(data["risk"]["level"], expected)
                self.assertTrue(data["meta"]["is_demo"])
                self.assertIsNone(data["meta"]["data_times"]["weather"])
                self.assertIn("예시 데이터", data["explanation"]["text"])

    def test_threshold_boundaries(self):
        for key, caution, danger in [("wave_height", 1, 2), ("wind_speed", 6, 10), ("precipitation", 3, 7)]:
            for value, level in [(caution-0.01, "low"), (caution, "caution"), (danger, "danger")]:
                values = dict(wave_height=0, wind_speed=0, precipitation=0, temperature=20)
                values[key] = value
                self.assertEqual(analyze(values)["level"], level)

    def test_invalid_inputs(self):
        for value in [None, float("nan"), -1, True, "2"]:
            with self.assertRaises(ValueError):
                validate_values(dict(wave_height=value, wind_speed=1, precipitation=0, temperature=20))

    def test_routes(self):
        self.assertEqual(len(self.client.get("/api/beaches").json()), 3)
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(self.client.get("/api/risk/unknown").status_code, 404)
        self.assertEqual(self.client.get("/api/risk/mangsang?mode=invalid").status_code, 422)

    def test_forecast_failure_never_silently_uses_demo(self):
        with patch("app.main.forecast", side_effect=httpx.ConnectError("offline")):
            r = self.client.get("/api/risk/mangsang?mode=forecast")
            self.assertEqual(r.status_code, 503)
            self.assertEqual(r.json()["detail"]["code"], "WEATHER_UNAVAILABLE")
            self.assertNotIn("values", r.json())

    def test_forecast_metadata(self):
        values = dict(wave_height=0.4, wind_speed=2, precipitation=0, temperature=20)
        with patch("app.main.forecast", return_value=(values, {"weather":"2026-10-14T09:00:00+09:00", "marine":"2026-10-14T09:00:00+09:00"}, 900)):
            data = self.client.get("/api/risk/mangsang?mode=forecast").json()
            self.assertFalse(data["meta"]["is_demo"])
            self.assertEqual(data["meta"]["data_kind"], "model_forecast")

    def test_llm_failure_preserves_rules(self):
        with patch.dict(os.environ, {"LLM_API_KEY":"dummy", "LLM_API_URL":"https://example.invalid"}), patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("offline")):
            data = self.client.get("/api/risk/eodal").json()
            self.assertEqual(data["explanation"]["source"], "rules")
            self.assertEqual(data["risk"]["level"], "danger")
            self.assertIn("실패", data["explanation"]["notice"])

if __name__ == "__main__":
    unittest.main()
