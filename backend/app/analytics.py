import os
from collections import Counter
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field

from .stats_db import database
from .stats_places import PLACES

# Preserve LJH's historical ID while accepting every SDH destination.
DESTINATIONS = {
    "mangsang": "망상해변", "nobong": "노봉해변", "daejin": "대진해변",
    "eodal": "어달해변", "hapyung": "하평해변", "hapyeong": "하평해변",
    "gobulgae": "고불개해변", "hanseom": "한섬해변", "gamchu": "감추해변",
    "chuam": "추암해변", "mangsangresort": "망상리조트해변", "gase": "가세해변",
    "mukhoport": "묵호항", "eodalport": "어달항", "cheongokport": "천곡항",
}




router = APIRouter(prefix="/api")


class PlanContext(BaseModel):
    travel_date: date | None = None
    start_hour: int | None = Field(default=None, ge=0, le=23)
    risk: Literal["낮음", "주의", "위험"]
    car: bool | None = None


class Event(BaseModel):
    context: PlanContext | None = None
    demo: bool = True
    id: UUID
    session_id: UUID
    kind: Literal["start", "plan_seen", "official_click", "map_click"]
    beach: str | None = Field(default=None, max_length=40)
    poi_id: str = Field(default="", max_length=80)




@router.post("/events", status_code=204)
def record(event: Event):
    if (event.beach and event.beach not in DESTINATIONS) or (event.poi_id and event.poi_id not in PLACES) or (event.kind != "start" and not event.beach):
        raise HTTPException(422, "장소 정보를 확인하세요.")
    with database() as q:
        saved = q("INSERT INTO events(id,session_id,kind,beach,poi_id,demo,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          (str(event.id), str(event.session_id), event.kind, event.beach or "", event.poi_id, int(event.demo), int(time.time())))

        if saved.rowcount and event.kind == "plan_seen" and event.context:
            c = event.context
            q("INSERT INTO plan_context(event_id,start_hour,risk,car,travel_date) VALUES(?,?,?,?,?)",
              (str(event.id), c.start_hour if c.start_hour is not None else -1, c.risk, int(c.car) if c.car is not None else -1, c.travel_date.isoformat() if c.travel_date else None))


@router.get("/admin/stats")
def stats(response: Response, days: int = Query(7, ge=1, le=30), authorization: str = Header(default=""),
          mode: Literal["forecast", "demo", "all"] = "demo"):
    token = os.getenv("ADMIN_TOKEN")
    if not token:
        raise HTTPException(503, "관리자 키 설정이 필요합니다.")
    if not secrets.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise HTTPException(401, "관리자 접속키를 확인하세요.")
    response.headers["Cache-Control"] = "no-store"
    now = datetime.now(timezone(timedelta(hours=9)))
    first = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days-1)
    params = (int(first.timestamp()), int(now.timestamp()))
    window = "created_at BETWEEN ? AND ?"
    condition = window
    if mode != "all":
        condition += " AND demo=?"
        params += (int(mode == "demo"),)
    # Start happens before the user selects a forecast mode.
    with database() as q:
        starts = q("SELECT COUNT(*) FROM events WHERE kind='start' AND " + window, params[:2]).fetchone()[0]
        counts = dict(q("SELECT kind,count(*) FROM events WHERE " + condition + " AND kind<>'start' GROUP BY kind", params).fetchall())
        beaches = q("SELECT beach,count(*) FROM events WHERE kind='plan_seen' AND " + condition + " GROUP BY beach ORDER BY count(*) DESC, beach", params).fetchall()
        popular = q("SELECT poi_id,count(*) FROM events WHERE poi_id<>'' AND kind IN ('map_click','official_click') AND " + condition + " GROUP BY poi_id ORDER BY count(*) DESC, poi_id", params).fetchall()
        daily = q("SELECT CAST((created_at + 32400)/86400 AS BIGINT), kind, count(*) FROM events WHERE " + condition + " AND kind<>'start' GROUP BY 1,2", params).fetchall()
        funnel = q("WITH scoped AS (SELECT session_id,kind,created_at FROM events WHERE " + condition + """),
            plans AS (SELECT session_id, MIN(created_at) first_view FROM scoped WHERE kind='plan_seen' GROUP BY session_id)
            SELECT COUNT(*), COUNT(CASE WHEN EXISTS (SELECT 1 FROM scoped s WHERE s.session_id=p.session_id
              AND s.kind IN ('map_click','official_click') AND s.created_at>=p.first_view) THEN 1 END) FROM plans p""", params).fetchone()
        context = q("SELECT start_hour,risk,car,count(*) FROM plan_context JOIN events ON events.id=event_id WHERE " + condition + " GROUP BY start_hour,risk,car ORDER BY start_hour,risk,car",params).fetchall()
        schedule = q("SELECT travel_date,beach,start_hour,count(*),sum(CASE WHEN car=0 THEN 1 ELSE 0 END) FROM plan_context JOIN events ON events.id=event_id WHERE travel_date IS NOT NULL AND " + condition + " GROUP BY travel_date,beach,start_hour ORDER BY travel_date,start_hour,beach",params).fetchall()
        trails = q("SELECT weather,count(*) FROM trail WHERE stops IS NOT NULL GROUP BY weather ORDER BY count(*) DESC, weather").fetchall()
    series = {(first+timedelta(days=i)).date().isoformat(): {"plan_seen":0,"map_click":0,"official_click":0} for i in range(days)}
    for epoch_day, kind, count in daily:
        day = (datetime(1970,1,1)+timedelta(days=epoch_day)).date().isoformat()
        series[day][kind] = count
    # Old LJH IDs and new SDH IDs may refer to the same displayed destination.
    def named_counts(rows, names):
        totals = Counter()
        for identifier, count in rows:
            totals[names.get(identifier, identifier)] += count
        return sorted(totals.items(), key=lambda row: (-row[1], row[0]))

    return {"counts": {**counts,"start":starts}, "beaches": named_counts(beaches, DESTINATIONS),
            "places": named_counts(popular, PLACES), "trails": trails, "daily": series,
            "sessions": {"viewed": funnel[0], "clicked": funnel[1]}, "context":context,
            "schedule":[(d,DESTINATIONS.get(b, b),h,n,c) for d,b,h,n,c in schedule],
            "from":first.date().isoformat(),"as_of":now.isoformat(timespec="seconds"),"mode":mode}
