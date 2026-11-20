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
