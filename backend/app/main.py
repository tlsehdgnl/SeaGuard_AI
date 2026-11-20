"""DePartner: transparent demonstration and model forecast risk advisory."""
import asyncio
import math
import os
import sys
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv

# Local settings override .env defaults; process/Vercel environment values win.
# Skipped under unittest so tests never spend a real key.
if "unittest" not in sys.modules:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local", override=False)
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .catalog import router as catalog_router
from .accounts import router as accounts_router
from .kakao import router as kakao_router
from . import fishing
from .analytics import router as analytics_router
from .integrations import router as integrations_router
from .ai import select_json
from .guide_chat import router as guide_chat_router
from .course import router as course_router
from .programs import router as programs_router
from .guide import build_guide, CATALOG, ACTIVITY_ACTIONS

app = FastAPI(title="DePartner AI", version="1.0.0")
app.include_router(catalog_router)
app.include_router(accounts_router)
app.include_router(kakao_router)
app.include_router(programs_router)
app.include_router(course_router)
app.include_router(guide_chat_router)
app.include_router(analytics_router)
app.include_router(integrations_router)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["*"])
BEACHES = [
    {"id": "mangsang", "name": "망상", "latitude": 37.593, "longitude": 129.09, "description": "넓은 백사장과 탁 트인 동해"},
    {"id": "chuam", "name": "추암", "latitude": 37.478, "longitude": 129.16, "description": "촛대바위 곁의 작은 해변"},
    {"id": "eodal", "name": "어달", "latitude": 37.554, "longitude": 129.116, "description": "해안 산책로와 가까운 해변"},
    {"id":"nobong", "name":"노봉", "latitude":37.588, "longitude":129.101, "description":"망상 남쪽의 해변"},
    {"id":"daejin", "name":"대진", "latitude":37.579, "longitude":129.111, "description":"동해시 대진동 해변"},
    {"id":"hanseom", "name":"한섬", "latitude":37.522, "longitude":129.123, "description":"한섬감성바닷길 인근 해변"},
    {"id": "mangsangresort", "name": "망상리조트", "latitude": 37.60082, "longitude": 129.07866, "description": "망상오토캠핑리조트 앞에 펼쳐진 해변이에요. 기곡해변으로도 알려져 있고, 바닷가에서 한옥마을까지 함께 둘러볼 수 있어요."},
    {"id": "hapyeong", "name": "하평", "latitude": 37.53365, "longitude": 129.11652, "description": "평릉동 철길 너머로 모래사장이 펼쳐져요. 바다와 철길이 나란히 이어지는 풍경을 볼 수 있어요."},
    {"id": "gase", "name": "가세", "latitude": 37.53, "longitude": 129.12, "description": "한섬감성바닷길을 따라 고불개에서 북쪽으로 걸으면 만나는 해변이에요. 데크길에서 바위 해안과 바다를 내려다볼 수 있어요."},
    {"id": "gobulgae", "name": "고불개", "latitude": 37.52771, "longitude": 129.12223, "description": "한섬과 가세 사이에 있는 작은 해변이에요. 해안 산책길을 따라 기암과 모래사장을 함께 볼 수 있어요."},
    {"id": "gamchu", "name": "감추", "latitude": 37.5152, "longitude": 129.12606, "description": "천곡동 감추사 곁에 길쭉한 모래사장이 있어요. 해안의 갯바위와 소나무를 함께 볼 수 있어요."},
    {"id": "mukhoport", "name": "묵호항", "latitude": 37.55204, "longitude": 129.11552, "description": "묵호의 어선과 항구 풍경을 보고 활·선어판매센터와 동쪽바다중앙시장을 이어서 둘러볼 수 있어요."},
    {"id": "eodalport", "name": "어달항", "latitude": 37.5615, "longitude": 129.12045, "description": "어달해변과 묵호 사이에 있는 작은 어항이에요. 해안도로를 따라 항구 풍경을 둘러볼 수 있어요."},
    {"id": "cheongokport", "name": "천곡항", "latitude": 37.52611, "longitude": 129.12376, "description": "한섬감성바닷길을 걸으며 들를 수 있는 작은 항구예요. 고불개해변과 함께 둘러보기 좋아요."},
]
DEMO = {"mangsang": (0.6, 3.2, 0.0, 22.4), "chuam": (1.3, 6.5, 1.0, 20.1), "eodal": (2.2, 10.4, 7.0, 19.8), "nobong": (0.7, 3.4, 0, 21), "daejin": (1.2, 5.5, 0, 20), "hanseom": (0.8, 4.1, 0, 21),
        "mangsangresort": (0.8, 4.1, 0, 21), "hapyeong": (0.8, 4.1, 0, 21), "gase": (0.8, 4.1, 0, 21), "gobulgae": (0.8, 4.1, 0, 21), "gamchu": (0.8, 4.1, 0, 21)}
DEMO.update({key: (0.8, 4.1, 0, 21) for key in ("mukhoport", "eodalport", "cheongokport")})
KST = timezone(timedelta(hours=9))

def now():
    return datetime.now(KST).isoformat(timespec="seconds")

def validate_values(values):
    limits = {"wave_height": (0, 30), "wind_speed": (0, 100), "precipitation": (0, 500), "temperature": (-90, 60)}
    for key, (low, high) in limits.items():
        value = values.get(key)
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError("Missing or invalid weather value")
    return values

def analyze(values, precipitation_interval_seconds=3600):
    """Illustrative MVP thresholds, not official swimming or rip-current criteria."""
    validate_values(values)
    reasons = []
    severity = 0
    for key, caution, danger, label, unit in [("wave_height", 1, 2, "파고", "m"), ("wind_speed", 6, 10, "풍속", "m/s"), ("precipitation", 3, 7, "강수량", "mm")]:
        value = values[key]
        if key == "precipitation" and precipitation_interval_seconds != 3600:
            reasons.append("강수 집계 구간이 1시간이 아니므로 강수량은 등급 산정에서 제외합니다.")
            continue
        level = 2 if value >= danger else 1 if value >= caution else 0
        severity = max(severity, level)
        if level:
            reasons.append(f"{label} {value:g}{unit}: {'위험' if level == 2 else '주의'} 예시 임계값 이상")
    if not reasons:
        reasons.append("입력된 파고·풍속·강수량이 MVP 주의 임계값 미만입니다.")
    return {"level": ["low", "caution", "danger"][severity], "label": ["낮음", "주의", "위험"][severity], "reasons": reasons, "rule_version": "mvp-2-interval-aware", "official": False}

def rule_explanation(risk, demo):
    action = {"low": "현장 안내와 통제 여부를 확인하세요. 낮은 수치도 입수 안전을 보장하지 않습니다.", "caution": "물놀이를 자제하고 현장 안전요원의 안내를 확인하세요.", "danger": "입수를 피하고 물가에서 떨어져 현장 통제에 따르세요."}[risk["level"]]
    return ("예시 데이터 분석입니다. 현재 해변 상태를 나타내지 않습니다. " if demo else "해변 인근 격자 예보 분석입니다. 실제 관측이나 공식 통제 정보가 아닙니다. ") + " ".join(risk["reasons"]) + " " + action

async def explanation(values, risk, demo):
    fallback = {"text": rule_explanation(risk, demo), "source": "rules", "notice": None}
    selection, status = await select_json(
        {"reasons": risk["reasons"], "demo": demo},
        '중요한 근거의 인덱스를 골라 {"reason_indices":[0]} 형식의 JSON만 반환하세요. 문장을 생성하지 마세요.'
    )
    if selection is not None:
        indices = selection.get("reason_indices")
        if set(selection) == {"reason_indices"} and isinstance(indices, list) and indices and all(type(i) is int and 0 <= i < len(risk["reasons"]) for i in indices) and len(set(indices)) == len(indices):
            return {**fallback, "source": "rules+llm", "supplement": " ".join(risk["reasons"][i] for i in indices), "notice": "AI가 선택한 근거를 표시합니다. 고정 행동 안내가 우선합니다."}
        status = "invalid"
    if status != "disabled":
        fallback["notice"] = "AI 설명 연결 또는 검증 실패·요청 제한으로 규칙 기반 설명을 제공합니다."
    return fallback

async def forecast(beach):
    params = {"latitude": beach["latitude"], "longitude": beach["longitude"], "timezone": "Asia/Seoul"}
    async with httpx.AsyncClient(timeout=10) as client:
        weather, marine = await asyncio.gather(
            client.get("https://api.open-meteo.com/v1/forecast", params={**params, "current": "temperature_2m,wind_speed_10m,precipitation", "wind_speed_unit": "ms"}),
            client.get("https://marine-api.open-meteo.com/v1/marine", params={**params, "current": "wave_height"}),
        )
    weather.raise_for_status()
    marine.raise_for_status()
    w, m = weather.json(), marine.json()
    if w["current_units"]["wind_speed_10m"] != "m/s" or m["current_units"]["wave_height"] != "m" or w["current_units"]["precipitation"] != "mm":
        raise ValueError("Unexpected units")
    values = validate_values({"wave_height": m["current"]["wave_height"], "wind_speed": w["current"]["wind_speed_10m"], "precipitation": w["current"]["precipitation"], "temperature": w["current"]["temperature_2m"]})
    times = {"weather": w["current"]["time"] + "+09:00", "marine": m["current"]["time"] + "+09:00"}
    for stamp in times.values():
        if abs((datetime.now(KST) - datetime.fromisoformat(stamp)).total_seconds()) > 10800:
            raise ValueError("Stale forecast")
    interval = w["current"]["interval"]
    if type(interval) is not int or not 0 < interval <= 86400:
        raise ValueError("Invalid precipitation interval")
    return values, times, interval

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/api/beaches")
def beaches():
    return BEACHES

async def risk_data(beach_id, mode, with_ai=True):
    beach = next((b for b in BEACHES if b["id"] == beach_id), None)
    if not beach:
        raise HTTPException(404, detail={"code": "BEACH_NOT_FOUND", "message": "지원하지 않는 해변입니다."})
    demo = mode == "demo"
    if demo:
        values = dict(zip(["wave_height", "wind_speed", "precipitation", "temperature"], DEMO[beach_id]))
        stamps = {"weather": None, "marine": None}
        interval = None
    else:
        try:
            values, stamps, interval = await forecast(beach)
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(503, detail={"code": "WEATHER_UNAVAILABLE", "message": "기상·해양 예보를 가져오지 못했거나 데이터가 불완전합니다. 다시 시도하거나 예시 모드를 직접 선택하세요."})
    result = analyze(values, 3600 if demo else interval)
    return {"beach": beach, "values": values, "risk": result, "explanation": await explanation(values, result, demo) if with_ai else {"text": rule_explanation(result, demo), "source": "rules", "notice": None}, "meta": {"mode": mode, "is_demo": demo, "data_kind": "synthetic" if demo else "model_forecast", "source": "DePartner 고정 예시 시나리오" if demo else "Open-Meteo / DWD 및 제공 모델", "source_urls": [] if demo else ["https://open-meteo.com/en/docs", "https://open-meteo.com/en/docs/marine-weather-api"], "data_times": stamps, "retrieved_at": now(), "precipitation_interval_seconds": interval, "notice": "공식 경보·입수 허가·이안류 예측이 아닙니다. 현장 통제와 기상청 특보를 우선 확인하세요."}}


@app.get("/api/risk/{beach_id}")
async def risk(beach_id: str, mode: Literal["demo", "forecast"] = "demo"):
    return await risk_data(beach_id, mode)


@app.get("/api/guide/{beach_id}")
async def guide(
    beach_id: str,
    mode: Literal["demo", "forecast"] = "demo",
    activity: str = Query(default="walk", max_length=80),
    children: bool = False,
    mobility: Literal["any", "stroller", "step_free"] = "any",
    transport: Literal["any", "car", "transit"] = "any",
    budget: Literal["any", "free"] = "any",
    time_budget: Literal["any", "30", "60", "90", "120", "180", "240"] = "any",
    visit_date: date | None = None,
    exclude: str = Query(default="", max_length=100),
):
    excluded = list(dict.fromkeys(filter(None, exclude.split(","))))
    if any(pid not in {p["id"] for p in CATALOG["places"]} for pid in excluded):
        raise HTTPException(422, detail={"message": "알 수 없는 장소 조건입니다."})
    selected = list(dict.fromkeys(activity.split(",")))
    if any(key not in ACTIVITY_ACTIONS for key in selected):
        raise HTTPException(422, detail={"message": "알 수 없는 활동입니다."})
    profile = dict(activities=selected, beach=beach_id, mode=mode, activity=activity, children=children,
                   mobility=mobility, transport=transport, budget=budget, time_budget=time_budget, exclude=excluded)
    if visit_date:
        profile["visit_date"] = visit_date.isoformat()
    weather_error = None
    try:
        weather = await risk_data(beach_id, mode, with_ai=False)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        weather = None
        weather_error = exc.detail
    return await build_guide(profile, weather, weather_error)


@app.get("/api/fishing")
def fishing_spots():
    """Beach id -> fishing spot name at that beach (for the destination badges)."""
    return {b["id"]: fishing.spot_here(b) for b in BEACHES if fishing.spot_here(b)}


@app.get("/api/fishing/{beach_id}")
async def fishing_info(beach_id: str, mode: Literal["demo", "forecast"] = "demo"):
    beach = next((b for b in BEACHES if b["id"] == beach_id), None)
    if beach is None:
        raise HTTPException(404, detail={"message": "지원하지 않는 해변입니다."})
    try:
        weather = await risk_data(beach_id, mode, with_ai=False)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        weather = None
    return await fishing.build(beach, weather, mode == "demo")


def hourly_points(weather, marine, start):
    expected = [(weather, "wind_speed_10m", "m/s"), (marine, "wave_height", "m")]
    for feed, field, unit in expected:
        if feed["hourly_units"][field] != unit or feed["utc_offset_seconds"] != 32400:
            raise ValueError("Unexpected hourly units or time zone")
    points = []
    for hours in (0, 3, 6):
        stamp = (start + timedelta(hours=hours)).replace(minute=0, second=0, microsecond=0)
        local = stamp.strftime("%Y-%m-%dT%H:%M")
        values = []
        for feed, field, maximum in [(weather, "wind_speed_10m", 100), (marine, "wave_height", 30)]:
            hourly = feed["hourly"]
            value = hourly[field][hourly["time"].index(local)]
            if type(value) not in (int, float) or not 0 <= value <= maximum:
                raise ValueError("Invalid hourly forecast")
            values.append(value)
        points.append(dict(hours=hours, time=stamp.isoformat(), wind=values[0], wave=values[1]))
    return points


@app.get("/api/outlook/{beach_id}")
async def outlook(beach_id: str, mode: Literal["demo", "forecast"] = "forecast"):
    beach = next((item for item in BEACHES if item["id"] == beach_id), None)
    if beach is None:
        raise HTTPException(404, detail={"message": "지원하지 않는 해변입니다."})
    if mode == "demo":
        wave, wind = DEMO[beach_id][:2]
        points = [dict(hours=h, time=None, wave=round(wave + dw, 1), wind=round(wind + ds, 1))
                  for h, dw, ds in [(0, 0, 0), (3, .3, 1), (6, .1, .5)]]
    else:
        start = datetime.now(KST)
        params = {key: beach[key] for key in ("latitude", "longitude")}
        params.update(timezone="Asia/Seoul", forecast_days=2)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                w, m = await asyncio.gather(
                    client.get("https://api.open-meteo.com/v1/forecast", params={**params, "hourly":"wind_speed_10m", "wind_speed_unit":"ms"}),
                    client.get("https://marine-api.open-meteo.com/v1/marine", params={**params, "hourly":"wave_height"}),
                )
            w.raise_for_status()
            m.raise_for_status()
            points = hourly_points(w.json(), m.json(), start)
        except (httpx.HTTPError, KeyError, ValueError, TypeError, IndexError):
            raise HTTPException(503, detail={"message":"해당 시간대의 예보를 확인할 수 없습니다."})
    return {"mode": mode, "points": points}
