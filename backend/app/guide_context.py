"""Step-specific facts for the guide characters' chat (what each character is allowed to talk about).

Every fact here comes from our own data or a live API call; the model is told to use only these.
Failures never break the chat: a missing source just means fewer facts.
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException

KST = timezone(timedelta(hours=9))
_daily_cache = {}


def _main():
    from . import main  # late import: main.py includes this module's router
    return main


def beach_by_id(beach_id):
    return next((b for b in _main().BEACHES if b["id"] == beach_id), None)


def beach_list():
    from . import fishing
    out = []
    for b in _main().BEACHES:
        kind = "항구" if b["id"].endswith("port") else "해변"
        item = {"id": b["id"], "name": b["name"] + ("" if kind == "항구" else "해변"), "kind": kind, "about": b["description"]}
        spot = fishing.spot_here(b)
        if spot:
            item["fishing_spot"] = spot
        out.append(item)
    return out


async def _kakao(kind, params):
    from . import kakao
    try:
        return (await kakao.local_get(kind, params)).get("documents", [])
    except HTTPException:
        return []


def _brief(doc):
    distance = str(doc.get("distance") or "")
    return {"name": doc.get("place_name", ""), "category": (doc.get("category_name") or "").split(" > ")[-1],
            "distance_m": int(distance) if distance.isdigit() else None}


async def around(lat, lng, radius=2500, groups=("AT4", "CE7", "FD6"), keywords=()):
    """Places around a point: Kakao category groups (AT4 sights, CE7 cafes, FD6 food) + optional keywords."""
    point = {"y": round(lat, 5), "x": round(lng, 5), "radius": radius, "sort": "distance", "size": 6}
    labels = {"AT4": "sights", "CE7": "cafes", "FD6": "restaurants"}
    calls = [_kakao("category", {**point, "category_group_code": g}) for g in groups]
    calls += [_kakao("keyword", {**point, "query": k}) for k in keywords]
    results = await asyncio.gather(*calls)
    out = {labels[g]: [_brief(d) for d in docs] for g, docs in zip(groups, results)}
    for k, docs in zip(keywords, results[len(groups):]):
        out["keyword:" + k] = [_brief(d) for d in docs]
    return {key: value for key, value in out.items() if value}


async def lookup_place(name):
    """Find a named place in/near Donghae and what is around it."""
    from .kakao import DONGHAE
    docs = await _kakao("keyword", {"query": name[:40], "y": DONGHAE[0], "x": DONGHAE[1], "radius": 20000, "size": 3, "sort": "accuracy"})
    if not docs:
        return {"query": name, "found": False}
    top = docs[0]
    return {"query": name, "found": True, "place": {"name": top.get("place_name"), "address": top.get("road_address_name") or top.get("address_name")},
            "nearby": await around(float(top["y"]), float(top["x"]), radius=1500)}


def _rate(wave, wind):
    """Same MVP thresholds as the briefing (wave 1/2 m, wind 6/10 m/s). Not an official judgement."""
    level = max(2 if wave >= 2 else 1 if wave >= 1 else 0, 2 if wind >= 10 else 1 if wind >= 6 else 0)
    return ["낮음", "주의", "위험"][level]


async def daily_outlook(beach, mode):
    """Today + next 2 days: daily max wave/wind, rain total and the service's risk label."""
    if mode == "demo":
        wave, wind, rain, temp = _main().DEMO[beach["id"]]
        return {"demo": True, "note": "시연용 고정 예시 값이에요. 실제 바다 상태가 아니에요.",
                "days": [{"date": "오늘(예시)", "wave_max_m": wave, "wind_max_ms": wind, "rain_mm": rain, "risk": _rate(wave, wind)}]}
    hit = _daily_cache.get(beach["id"])
    if hit and time.monotonic() - hit[0] < 600:
        return hit[1]
    params = {"latitude": beach["latitude"], "longitude": beach["longitude"], "timezone": "Asia/Seoul", "forecast_days": 3}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            w, m = await asyncio.gather(
                client.get("https://api.open-meteo.com/v1/forecast", params={**params, "wind_speed_unit": "ms",
                           "daily": "wind_speed_10m_max,precipitation_sum,temperature_2m_max,temperature_2m_min"}),
                client.get("https://marine-api.open-meteo.com/v1/marine", params={**params, "daily": "wave_height_max"}))
        w.raise_for_status(); m.raise_for_status()
        wd, md = w.json()["daily"], m.json()["daily"]
        today = datetime.now(KST).date()
        days = []
        for i, day in enumerate(wd["time"][:3]):
            wave, wind = md["wave_height_max"][i], wd["wind_speed_10m_max"][i]
            if wave is None or wind is None:
                continue
            offset = (datetime.fromisoformat(day).date() - today).days
            days.append({"date": day, "when": ["오늘", "내일", "모레"][offset] if 0 <= offset < 3 else day,
                         "wave_max_m": round(wave, 1), "wind_max_ms": round(wind, 1), "rain_mm": wd["precipitation_sum"][i],
                         "temp_c": [wd["temperature_2m_min"][i], wd["temperature_2m_max"][i]], "risk": _rate(wave, wind)})
        result = {"demo": False, "source": "Open-Meteo 격자 모델 예보 (일 최대값)", "days": days}
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        result = {"demo": False, "unavailable": True, "days": []}
    _daily_cache[beach["id"]] = (time.monotonic(), result)
    return result


async def facts_for(step, beach_id, mode, client_context):
    beach = beach_by_id(beach_id) if beach_id else None
    here = {"selected": {"name": beach["name"], "about": beach["description"]}} if beach else {}
    if step == 0:
        return {**here, "destinations": beach_list(),
                "crowd_data": "실시간 혼잡도 데이터는 없어요. 규모·소개 글로만 한적할 가능성을 짐작할 수 있어요."}
    if step == 1:
        if not beach:
            return here
        return {**here, "nearby": await around(beach["latitude"], beach["longitude"], radius=3000, groups=("AT4",), keywords=("산책로", "둘레길"))}
    if step == 2:
        if not beach:
            return here
        return {**here, "forecast": await daily_outlook(beach, mode)}
    if step == 3:
        if not beach:
            return here
        return {**here, "nearby": await around(beach["latitude"], beach["longitude"])}
    route = (client_context or {}).get("route")
    return {**here, "route": route or "아직 코스 경로(실시간 교통)가 화면에 만들어지지 않았어요."}
