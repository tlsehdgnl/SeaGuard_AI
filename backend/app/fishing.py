"""Fishing spots near a beach + rule-based fishing safety.

Spots are a team-verified-later draft. Species and the fishing index come only
from an external fishing API (see `load_api_index`) or, in demo mode, from a
clearly labelled fixture. Never invent species for live (forecast) responses.
"""
import asyncio
import json
import logging
import math
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

DATA = json.loads((Path(__file__).parent / "data" / "fishing.json").read_text(encoding="utf-8"))
log = logging.getLogger("seaguard.fishing")
KST = timezone(timedelta(hours=9))

# 해양수산부 국립해양조사원_바다낚시지수 조회 (data.go.kr 15142486)
# The base URL on the portal page is missing the operation; this full path is verified.
API_URL = "https://apis.data.go.kr/1192136/fcstFishingv2/GetFcstFishingApiServicev2"
GUBUN = ("갯바위", "선상")  # location types the API accepts
# Verified response fields (2026-11-20): seafsPstnNm, lat, lot, predcYmd(YYYY-MM-DD),
# predcNoonSeCd(오전/오후), seafsTgfshNm, tdlvHrCn, min/maxWvhgt, min/maxWtem, totalIndex(5 levels).
FIELDS = {"name": ["seafsPstnNm"], "fish": ["seafsTgfshNm"], "index": ["totalIndex"], "date": ["predcYmd"]}
_cache = {}


def pick(item, field):
    for key in FIELDS[field]:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize_index(raw):
    """API gives a 5-level label (매우좋음…매우나쁨); the UI uses 좋음/보통/나쁨."""
    text = str(raw or "")
    return "좋음" if "좋음" in text else "나쁨" if "나쁨" in text else "보통" if text else None


def extract_items(payload):
    body = payload.get("response", payload).get("body", payload.get("body", {}))
    items = body.get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    return [items] if isinstance(items, dict) else list(items or [])


async def fetch_all():
    """Every official point, 7 days, both location types (about 14 small pages fetched in
    parallel, cached 1 h so the daily quota of 10,000 calls is never a concern)."""
    key = os.getenv("FISHING_API_KEY")
    if not key:
        return None
    if _cache.get("all") and time.monotonic() - _cache["all"][0] < 3600:
        return _cache["all"][1]
    today = datetime.now(KST).strftime("%Y%m%d")

    async def page(client, gubun, number):
        r = await client.get(API_URL, params={"serviceKey": key, "type": "json", "gubun": gubun, "reqDate": today,
                                              "numOfRows": 300, "pageNo": number})
        if r.is_error:  # never let the URL (it carries the key) reach logs or output
            raise ValueError(f"Fishing API HTTP {r.status_code}: {r.text[:200]}")
        payload = r.json()
        body = payload.get("response", payload).get("body", payload.get("body", {}))
        return int(body.get("totalCount") or 0), [{**i, "_gubun": gubun} for i in extract_items(payload)]

    rows = []
    async with httpx.AsyncClient(timeout=15) as client:
        firsts = await asyncio.gather(*(page(client, g, 1) for g in GUBUN))
        rest = []
        for gubun, (total, items) in zip(GUBUN, firsts):
            rows += items
            rest += [page(client, gubun, n) for n in range(2, math.ceil(total / 300) + 1)]
        for _, items in await asyncio.gather(*rest):
            rows += items
    _cache["all"] = (time.monotonic(), rows)
    return rows


def distance_km(a_lat, a_lon, b_lat, b_lon):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def nearby_spots(beach):
    rows = []
    for spot in DATA["spots"]:
        d = distance_km(beach["latitude"], beach["longitude"], spot["latitude"], spot["longitude"])
        if d <= DATA["nearby_radius_km"]:
            rows.append({**spot, "distance_km": round(d, 1)})
    return sorted(rows, key=lambda s: s["distance_km"])


def spot_here(beach):
    """Name of a fishing spot at this beach (within spot_radius_km), else None."""
    rows = nearby_spots(beach)
    return rows[0]["name"] if rows and rows[0]["distance_km"] <= DATA["spot_radius_km"] else None


SCORE = {"매우좋음": 5, "좋음": 4, "보통": 3, "나쁨": 2, "매우나쁨": 1}
WEEKDAY = "월화수목금토일"


def when(row):
    day = datetime.strptime(row["predcYmd"], "%Y-%m-%d")
    period = {"일": "종일"}.get(row.get("predcNoonSeCd"), row.get("predcNoonSeCd") or "")
    return f"{day.month}/{day.day}({WEEKDAY[day.weekday()]}) {period}".strip()




def sea_flag(row):
    """Our rule thresholds on the API's own max wave/wind: danger rows are never recommended."""
    wave, wind = row.get("maxWvhgt") or 0, row.get("maxWspd") or 0
    return "danger" if wave >= 2 or wind >= 10 else "caution" if wave >= 1 or wind >= 6 else "ok"


def named(row):
    return row.get("seafsTgfshNm") not in (None, "", "-", "기타어종")


def analyze(rows, beach):
    """Donghae-focused summary of the official index. Pure function (testable).

    Uses only official points in the sea next to Donghae (within local_radius_km).
    The output never names those points: they lie outside Donghae city, and the
    service is about Donghae. Danger-sea slots (wave >= 2 m or wind >= 10 m/s) are
    never picked as a "good" time.
      week: best index per remaining day.  species: best day/period per named species.
      local_species: species rated 보통+ this week.
    """
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")

    def passed(row):  # skip slots already over: earlier days, and today's 오전 after noon
        return row.get("predcYmd", "") < today or (row.get("predcYmd") == today and row.get("predcNoonSeCd") == "오전" and now.hour >= 12)

    local = []
    for row in rows:
        if passed(row) or row.get("totalIndex") not in SCORE or not row.get("predcYmd"):
            continue
        try:
            d = distance_km(beach["latitude"], beach["longitude"], float(row["lat"]), float(row["lot"]))
        except (KeyError, TypeError, ValueError):
            continue
        if d <= DATA["local_radius_km"]:
            local.append(row)
    if not local:
        return None

    def rank(r):
        return (-SCORE[r["totalIndex"]], sea_flag(r) != "ok", r["predcYmd"], r.get("predcNoonSeCd") or "")

    usable = sorted((r for r in local if sea_flag(r) != "danger"), key=rank)
    week = []
    for day in sorted({r["predcYmd"] for r in local}):
        top = next((r for r in usable if r["predcYmd"] == day), None)
        week.append({"date": day, "label": when({"predcYmd": day}), "index": top["totalIndex"] if top else None,
                     "when": when(top) if top else None, "sea": sea_flag(top) if top else "danger"})
    species = {}
    for r in usable:
        if named(r) and r["seafsTgfshNm"] not in species:
            species[r["seafsTgfshNm"]] = {"species": r["seafsTgfshNm"], "when": when(r), "index": r["totalIndex"],
                                          "sea": sea_flag(r)}
    expected = list(dict.fromkeys(r["seafsTgfshNm"] for r in usable if named(r) and SCORE[r["totalIndex"]] >= 3))
    temps = [r.get("maxWtem") for r in local if isinstance(r.get("maxWtem"), (int, float))]
    today_rows = [r["totalIndex"] for r in local if r["predcYmd"] == today]
    return {
        "week": week, "species": list(species.values())[:8], "local_species": expected,
        "local_water_temp": [min(temps), max(temps)] if temps else None,
        "local_today_worst": min(today_rows, key=SCORE.get) if today_rows else None,
    }


async def load_api_index(beach):
    try:
        rows = await fetch_all()
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
        log.warning("Fishing API failed: %s", type(exc).__name__)
        return None
    return analyze(rows, beach) if rows else None


def safety(weather, index_values=()):
    """Same illustrative thresholds as the main risk rule (wave 1/2 m, wind 6/10 m/s)."""
    if weather is None:
        return {"level": "unknown", "label": "낚시 안전 확인 필요",
                "detail": "예보를 불러오지 못해 낚시 안전을 판단하지 않아요. 기상청 특보를 먼저 확인하세요.", "reasons": []}
    level = {"low": "good", "caution": "caution", "danger": "danger"}[weather["risk"]["level"]]
    reasons = [r for r in weather["risk"]["reasons"] if "임계값 이상" in r]
    if level == "good" and "나쁨" in index_values:
        level = "caution"
        reasons.append("인근 공식 지점 낚시지수 '나쁨'")
    label, detail = {
        "good": ("낚시하기 좋은 바다예요", "파도와 바람이 예시 기준 아래예요. 현장 통제와 출입금지 구역은 꼭 확인하세요."),
        "caution": ("지금은 낚시 조심!", "파도·바람이 있어요. 갯바위·방파제 끝은 피하고 안쪽에서만 짧게 즐기세요."),
        "danger": ("지금 낚시는 위험해요", "높은 파도나 강한 바람이 예상돼요. 오늘은 갯바위·방파제 낚시를 미뤄 주세요."),
    }[level]
    return {"level": level, "label": label, "detail": detail, "reasons": reasons}


async def build(beach, weather, demo):
    spots = nearby_spots(beach)
    report = await load_api_index(beach)  # official data is real in both modes when a key exists
    for spot in spots:
        info = DATA["demo_index"].get(spot["id"], {}) if demo and not report else {}
        spot.update(index=info.get("index"), fish=info.get("fish", []),
                    map_url="https://map.naver.com/p/search/" + quote("동해시 " + spot["name"].replace(" 일대", "")))
    anchor = spots[0]["name"].replace(" 일대", "").replace(" 방파제", "") if spots else "동해시"
    indexes = [s["index"] for s in spots if s["index"]]
    if report and report["local_today_worst"]:
        indexes.append(normalize_index(report["local_today_worst"]))
    return {
        "beach_id": beach["id"],
        "spot_here": spot_here(beach),
        "spots": spots,
        "analysis": report,
        "safety": safety(weather, indexes),
        "tackle_url": "https://map.naver.com/p/search/" + quote(f"{anchor} 낚시점"),
        "tackle_label": f"{anchor} 근처 낚시용품점",
        "rules": DATA["rules"],
        "data_kind": "api" if report else ("demo" if demo else "none"),
        "notice": ("동해시 안에는 공식 낚시지수 지점이 없어 동해 인근 해역 지점의 7일 예측을 기준으로 했어요. 실제 조황과 다를 수 있어요." if report else
                   "시연용 예시 어종·지수입니다. 실제 조황이 아닙니다." if demo else
                   "공식 낚시지수를 불러오지 못했어요."),
        "source": "국립해양조사원 바다낚시지수 (공공데이터포털, 공공누리 제1유형)",
        "draft_notice": DATA["note"],
    }
