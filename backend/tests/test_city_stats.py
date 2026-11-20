import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from app.main import app


class CityStatsTests(TestCase):
    def test_korean_midnight_filters_sessions_and_historical_records(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
            "TRAIL_DB_PATH": tmp+"/db", "TRAIL_DATABASE_URL":"", "ADMIN_TOKEN":"test-key"
        }):
            client = TestClient(app)
            midnight = datetime.now(timezone(timedelta(hours=9))).replace(hour=0, minute=0, second=0, microsecond=0)
            anchor = int(midnight.timestamp())
            session = str(uuid4())
            def emit(kind, stamp, demo=False, context=None):
                body = dict(id=str(uuid4()),session_id=session,beach="chuam",kind=kind,demo=demo,context=context)
                with patch("app.analytics.time.time", return_value=stamp):
                    for _ in range(2):
                        self.assertEqual(client.post("/api/events",json=body).status_code,204)
            emit("plan_seen",anchor-1)
            emit("plan_seen",anchor,context=dict(start_hour=8,risk="주의",car=False,travel_date="2026-11-23"))
            emit("map_click",anchor+1)
            emit("plan_seen",anchor,True)
            session=str(uuid4())
            emit("official_click",anchor)
            emit("plan_seen",anchor+1)
            with patch("app.analytics.datetime", wraps=datetime) as clock:
                clock.now.return_value = midnight + timedelta(seconds=2)
                self.assertEqual(client.get("/api/admin/stats").status_code,401)
                for mode,expected in [("forecast",2),("demo",1),("all",3)]:
                    stats=client.get("/api/admin/stats",params={"days":1,"mode":mode},headers={"Authorization":"Bearer test-key"}).json()
                    self.assertEqual(stats["counts"]["plan_seen"],expected)
                    self.assertEqual(next(iter(stats["daily"].values()))["plan_seen"],expected)
                    if mode=="forecast":
                        self.assertEqual(stats["sessions"],{"viewed":2,"clicked":1})
                        self.assertEqual(stats["context"],[[8,"주의",0,1]])
                        self.assertEqual(stats["schedule"],[["2026-11-23","추암해변",8,1,1]])

    def test_sdh_destinations_places_and_unspecified_context(self):
        from app.main import BEACHES
        from app.stats_places import PLACES
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
            "TRAIL_DB_PATH": tmp+"/db", "TRAIL_DATABASE_URL": "", "ADMIN_TOKEN": "test-key"
        }):
            client = TestClient(app)
            def emit(beach, poi="", kind="plan_seen", **extra):
                return client.post("/api/events", json=dict(
                    id=str(uuid4()), session_id=str(uuid4()), kind=kind,
                    beach=beach, poi_id=poi, demo=True, **extra))
            for beach in BEACHES:
                self.assertEqual(emit(beach["id"], context={"risk":"주의", "car":None}).status_code, 204, beach["id"])
            for poi in PLACES:
                self.assertEqual(emit("hapyeong", poi, "map_click").status_code, 204, poi)
            self.assertEqual(emit("hapyung").status_code, 204)  # Historical LJH ID.
            self.assertEqual(emit("unknown").status_code, 422)
            self.assertEqual(emit("mangsang", "unknown").status_code, 422)
            result = client.get("/api/admin/stats?mode=demo", headers={"Authorization":"Bearer test-key"})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.headers["cache-control"], "no-store")
            data = result.json()
            self.assertIn(["묵호항",1], data["beaches"])
            self.assertIn([-1,"주의",-1,len(BEACHES)], data["context"])
            self.assertEqual(data["schedule"], [])
            self.assertEqual(len(data["places"]), len(set(PLACES.values())))
            self.assertIn(["하평해변",2], data["beaches"])
            self.assertEqual(client.get("/api/admin/stats",headers={"Authorization":"Bearer wrong"}).status_code,401)
            preflight = client.options("/api/events", headers={
                "Origin":"http://localhost:5173", "Access-Control-Request-Method":"POST",
                "Access-Control-Request-Headers":"content-type"})
            self.assertEqual(preflight.status_code, 200)
