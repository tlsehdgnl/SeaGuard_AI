import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import kakao
from app.main import app

ORIGIN = {"origin": "http://localhost:5173"}


class KakaoTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.env = patch.dict(os.environ, {"KAKAO_REST_API_KEY": "", "KAKAO_MOBILITY_KEY": "", "KAKAO_REDIRECT_URI": "",
                                           "VERCEL": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_everything_off_without_keys(self):
        self.assertEqual(self.client.get("/api/kakao/config").json(), {"login": False, "route": False, "connected": False})
        self.assertEqual(self.client.get("/api/kakao/login", follow_redirects=False).status_code, 503)
        self.assertEqual(self.client.post("/api/kakao/route", json={"points": [[37.5, 129.1], [37.6, 129.1]]}).status_code, 503)

    def test_login_redirects_with_state_cookie(self):
        with patch.dict(os.environ, {"KAKAO_REST_API_KEY": "k", "KAKAO_REDIRECT_URI": "http://localhost:5173/api/kakao/callback"}):
            r = self.client.get("/api/kakao/login", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertIn("kauth.kakao.com/oauth/authorize", r.headers["location"])
        self.assertIn("talk_message", r.headers["location"])
        self.assertIn(kakao.STATE, r.cookies)

    def test_callback_rejects_wrong_state(self):
        r = self.client.get("/api/kakao/callback?code=abc&state=forged", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers["location"].endswith("kakao=error"))

    def test_memo_needs_kakao_login(self):
        body = {"title": "t", "items": [{"title": "a", "description": "b"}, {"title": "c", "description": "d"}], "url": "x"}
        self.assertEqual(self.client.post("/api/kakao/memo", json=body, headers=ORIGIN).status_code, 401)

    def test_traffic_segments_are_merged_and_colored(self):
        route = {"summary": {"distance": 3000, "duration": 600}, "sections": [
            {"distance": 1000, "duration": 200, "roads": [
                {"traffic_state": 4, "vertexes": [129.10, 37.55, 129.11, 37.56]},
                {"traffic_state": 4, "vertexes": [129.11, 37.56, 129.12, 37.57]},
                {"traffic_state": 1, "vertexes": [129.12, 37.57, 129.13, 37.58]}]},
            {"distance": 2000, "duration": 400, "roads": [{"traffic_state": 0, "vertexes": [129.13, 37.58, 129.14, 37.59]}]}]}
        out = kakao.simplify(route)
        self.assertEqual([s["level"] for s in out["segments"]], ["smooth", "jam", "unknown"])
        self.assertEqual(out["segments"][0]["path"], [[37.55, 129.10], [37.56, 129.11], [37.57, 129.12]])  # [lat, lng]
        self.assertEqual(len(out["legs"]), 2)


if __name__ == "__main__":
    unittest.main()
