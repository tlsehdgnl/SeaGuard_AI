import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app import fishing
from app.main import app


class FishingTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.env = patch.dict(os.environ, {"LLM_API_KEY": "", "LLM_API_URL": "", "OPENAI_API_KEY": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_spot_badges_only_for_nearby_beaches(self):
        spots = self.client.get("/api/fishing").json()
        self.assertIn("mukhoport", spots)
        self.assertIn("eodalport", spots)
        self.assertNotIn("mangsangresort", spots)

    def test_demo_levels_follow_risk_rule(self):
        # demo values: mangsang low, chuam caution, eodal danger
        for beach, level in [("chuam", "caution"), ("eodal", "danger")]:
            with self.subTest(beach=beach):
                data = self.client.get(f"/api/fishing/{beach}?mode=demo").json()
                self.assertEqual(data["safety"]["level"], level)
                self.assertEqual(data["data_kind"], "demo")
                self.assertTrue(data["rules"])

    def test_bad_index_downgrades_good_sea(self):
        weather = {"risk": {"level": "low", "reasons": []}}
        self.assertEqual(fishing.safety(weather, ["좋음"])["level"], "good")
        self.assertEqual(fishing.safety(weather, ["나쁨"])["level"], "caution")

    def test_live_mode_never_invents_species(self):
        values = dict(wave_height=0.4, wind_speed=2, precipitation=0, temperature=20)
        with patch("app.main.forecast", return_value=(values, {"weather": "x", "marine": "x"}, 3600)):
            data = self.client.get("/api/fishing/mukhoport?mode=forecast").json()
        self.assertEqual(data["data_kind"], "none")
        self.assertTrue(all(s["fish"] == [] and s["index"] is None for s in data["spots"]))
        self.assertEqual(data["safety"]["level"], "good")

    def test_forecast_failure_is_unknown_not_good(self):
        with patch("app.main.forecast", side_effect=httpx.ConnectError("offline")):
            data = self.client.get("/api/fishing/mukhoport?mode=forecast").json()
        self.assertEqual(data["safety"]["level"], "unknown")

    @staticmethod
    def rows():
        from datetime import datetime, timedelta
        base = datetime.now(fishing.KST)
        d1, d2 = ((base + timedelta(days=n)).strftime("%Y-%m-%d") for n in (1, 2))

        def row(name, lat, lot, day, period, fish, index, wave=0.4, wind=3):
            return {"seafsPstnNm": name, "lat": lat, "lot": lot, "predcYmd": day, "predcNoonSeCd": period,
                    "seafsTgfshNm": fish, "totalIndex": index, "minWvhgt": wave, "maxWvhgt": wave,
                    "maxWspd": wind, "maxWtem": 15.0, "tdlvHrCn": "조금", "_gubun": "갯바위"}
        return [
            row("대진항", 37.3472, 129.2633, d1, "오전", "감성돔", "좋음"),
            row("대진항", 37.3472, 129.2633, d1, "오전", "우럭", "보통"),
            row("대진항", 37.3472, 129.2633, d2, "오후", "감성돔", "매우좋음", wave=2.4),  # dangerous sea
            row("남애항", 37.9425, 128.7895, d2, "오전", "돌돔", "좋음"),
            row("남애항", 37.9425, 128.7895, d1, "오후", "-", "매우좋음"),
            row("제주 김녕", 33.55, 126.75, d1, "오전", "벵에돔", "매우좋음"),  # outside region
        ]

    def test_analysis_is_donghae_only_and_skips_dangerous_sea(self):
        beach = {"latitude": 37.552, "longitude": 129.1155}
        report = fishing.analyze(self.rows(), beach)
        self.assertNotIn("best", report)
        self.assertNotIn("남애", str(report))            # 52 km away: outside the Donghae sea area
        self.assertNotIn("대진항", str(report))           # nearby point is used but never named
        by_species = {s["species"]: s for s in report["species"]}
        self.assertEqual(set(by_species), {"감성돔", "우럭"})
        self.assertEqual(by_species["감성돔"]["index"], "좋음")  # 매우좋음 slot had 2.4 m waves
        self.assertEqual(report["local_species"], ["감성돔", "우럭"])
        self.assertEqual(len(report["week"]), 2)

    def test_live_endpoint_uses_analysis_and_never_tags_donghae_spots(self):
        values = dict(wave_height=0.4, wind_speed=2, precipitation=0, temperature=20)
        with patch("app.main.forecast", return_value=(values, {"weather": "x", "marine": "x"}, 3600)), \
                patch("app.fishing.fetch_all", return_value=self.rows()):
            data = self.client.get("/api/fishing/mukhoport?mode=forecast").json()
        self.assertEqual(data["data_kind"], "api")
        self.assertTrue(data["analysis"]["species"])
        self.assertTrue(all(s["fish"] == [] for s in data["spots"]))

    def test_api_failure_falls_back_to_no_analysis(self):
        import asyncio
        with patch("app.fishing.fetch_all", side_effect=httpx.ConnectError("offline")):
            self.assertIsNone(asyncio.run(fishing.load_api_index({"latitude": 37.55, "longitude": 129.11})))

    def test_fishing_activity_accepted_with_fixed_action(self):
        data = self.client.get("/api/guide/eodal?mode=demo&activity=fishing").json()
        ids = [a["id"] for a in data["actions"]]
        self.assertIn("fishing", ids)
        self.assertIn("fishing-signal", ids)


if __name__ == "__main__":
    unittest.main()
