"""SeaGuard: transparent demonstration and model forecast risk advisory."""
import asyncio
import json
import math
import os
from datetime import datetime, timezone, timedelta
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SeaGuard AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET"], allow_headers=["*"])
BEACHES = [
    {"id": "mangsang", "name": "망상", "latitude": 37.593, "longitude": 129.09, "description": "넓은 백사장과 탁 트인 동해"},
    {"id": "chuam", "name": "추암", "latitude": 37.478, "longitude": 129.16, "description": "촛대바위 곁의 작은 해변"},
    {"id": "eodal", "name": "어달", "latitude": 37.554, "longitude": 129.116, "description": "해안 산책로와 가까운 해변"},
]
DEMO = {"mangsang": (0.6, 3.2, 0.0, 22.4), "chuam": (1.3, 6.5, 1.0, 20.1), "eodal": (2.2, 10.4, 7.0, 19.8)}
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

def analyze(values):
    """Illustrative MVP thresholds, not official swimming or rip-current criteria."""
    validate_values(values)
    reasons = []
    severity = 0
    for key, caution, danger, label, unit in [("wave_height", 1, 2, "파고", "m"), ("wind_speed", 6, 10, "풍속", "m/s"), ("precipitation", 3, 7, "강수량", "mm")]:
        value = values[key]
        level = 2 if value >= danger else 1 if value >= caution else 0
        severity = max(severity, level)
        if level:
            reasons.append(f"{label} {value:g}{unit}: {'위험' if level == 2 else '주의'} 예시 임계값 이상")
    if not reasons:
        reasons.append("입력된 파고·풍속·강수량이 MVP 주의 임계값 미만입니다.")
    return {"level": ["low", "caution", "danger"][severity], "label": ["낮음", "주의", "위험"][severity], "reasons": reasons, "rule_version": "mvp-1", "official": False}

def rule_explanation(risk, demo):
    action = {"low": "현장 안내와 통제 여부를 확인하세요. 낮은 수치도 입수 안전을 보장하지 않습니다.", "caution": "물놀이를 자제하고 현장 안전요원의 안내를 확인하세요.", "danger": "입수를 피하고 물가에서 떨어져 현장 통제에 따르세요."}[risk["level"]]
    return ("예시 데이터 분석입니다. 현재 해변 상태를 나타내지 않습니다. " if demo else "해변 인근 격자 예보 분석입니다. 실제 관측이나 공식 통제 정보가 아닙니다. ") + " ".join(risk["reasons"]) + " " + action

async def explanation(values, risk, demo):
    fallback = {"text": rule_explanation(risk, demo), "source": "rules", "notice": None}
    key = os.getenv("LLM_API_KEY")
    endpoint = os.getenv("LLM_API_URL")
    if not key or not endpoint:
        return fallback
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(endpoint, headers={"Authorization": f"Bearer {key}"}, json={"model": os.getenv("LLM_MODEL", "configured-model"), "temperature": 0, "max_tokens": 220, "messages": [{"role": "system", "content": "한국어로 제공된 수치의 의미만 2문장으로 설명하세요. 입수 허가, 안전 보장, 공식 경보, 이안류 예측을 주장하지 마세요. 위험 등급을 바꾸지 마세요. 입력 밖의 사실은 추가하지 마세요."}, {"role": "user", "content": json.dumps({"values": values, "risk": risk, "demo": demo}, ensure_ascii=False)}]})
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                raise ValueError("Invalid LLM text")
            # Rule-based advice is always shown; generated content is supplemental only.
            return {**fallback, "source": "rules+llm", "supplement": text.strip(), "notice": "AI 보충 설명은 검증되지 않았으며 위험 등급·행동 안내를 대체하지 않습니다."}
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return {**fallback, "notice": "AI 설명 연결 실패로 규칙 기반 설명을 제공합니다."}

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
    return values, times, w["current"]["interval"]

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/api/beaches")
def beaches():
    return BEACHES

@app.get("/api/risk/{beach_id}")
async def risk(beach_id: str, mode: Literal["demo", "forecast"] = "demo"):
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
    result = analyze(values)
    return {"beach": beach, "values": values, "risk": result, "explanation": await explanation(values, result, demo), "meta": {"mode": mode, "is_demo": demo, "data_kind": "synthetic" if demo else "model_forecast", "source": "SeaGuard 고정 예시 시나리오" if demo else "Open-Meteo / DWD 및 제공 모델", "source_urls": [] if demo else ["https://open-meteo.com/en/docs", "https://open-meteo.com/en/docs/marine-weather-api"], "data_times": stamps, "retrieved_at": now(), "precipitation_interval_seconds": interval, "notice": "공식 경보·입수 허가·이안류 예측이 아닙니다. 현장 통제와 기상청 특보를 우선 확인하세요."}}
