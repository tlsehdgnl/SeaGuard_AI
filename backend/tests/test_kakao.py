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
        body = {"title": "t", "subtitle": "s", "description": "d", "rows": [], "summary": "x", "url": "x"}
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
        self.assertEqual([s["leg"] for s in out["segments"]], [0, 0, 1])  # lets the UI show one leg at a time


if __name__ == "__main__":
    unittest.main()


class KakaoLocalTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        kakao._local_cache.clear()

    def test_nearby_parking_is_sorted_and_counted(self):
        from unittest.mock import AsyncMock
        docs = {"meta": {"total_count": 3}, "documents": [
            {"id": "1", "place_name": "망상 공영주차장", "road_address_name": "동해대로 1", "category_name": "교통 > 주차장",
             "x": "129.09", "y": "37.59", "distance": "150", "place_url": "http://place.map.kakao.com/1"}]}
        with patch.dict(os.environ, {"KAKAO_REST_API_KEY": "k"}), patch("app.kakao.local_get", AsyncMock(return_value=docs)):
            data = self.client.get("/api/kakao/nearby?lat=37.59&lng=129.09&kind=parking").json()
        self.assertEqual(data["count"], 3)
        self.assertEqual(data["items"][0]["distance"], 150)
        self.assertEqual(data["items"][0]["name"], "망상 공영주차장")

    def test_nearby_rejects_unknown_kind_and_far_points(self):
        self.assertEqual(self.client.get("/api/kakao/nearby?lat=37.5&lng=129.1&kind=bar").status_code, 422)
        self.assertEqual(self.client.get("/api/kakao/nearby?lat=0&lng=0&kind=parking").status_code, 422)

    def test_place_search_needs_two_characters(self):
        self.assertEqual(self.client.get("/api/kakao/places?q=a").status_code, 422)


class KakaoMemoTemplateTests(unittest.TestCase):
    def test_feed_receipt_keeps_links_on_our_domain(self):
        base = "https://departner-donghae.vercel.app/"
        body = kakao.Memo(title="망상해변 바다 여행", subtitle="11/23(월) 10:00–18:00", description="산책 · 파도 조금",
                          rows=[kakao.Row(time="10:01", name="망상해변"), kakao.Row(time="12:00", name="아주아주아주아주긴식당이름본점")],
                          summary="2곳 · 식사 1회", image=base + "beaches/mangsang.jpg",
                          url=base + "#beach=mangsang&view=plan", brief_url="https://evil.example/")
        t = kakao.memo_template(body, base)
        self.assertEqual(t["object_type"], "feed")
        self.assertEqual([i["item"] for i in t["item_content"]["items"]], ["10:01", "12:00"])
        self.assertTrue(t["item_content"]["items"][1]["item_op"].endswith("…"))   # long names are clipped
        self.assertEqual(t["buttons"][0]["link"]["web_url"], base + "#beach=mangsang&view=plan")
        self.assertEqual(t["buttons"][1]["link"]["web_url"], base)                  # foreign link replaced
        self.assertEqual(t["content"]["image_url"], base + "beaches/mangsang.jpg")
