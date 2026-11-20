"""Kakao: login (OAuth), "send to me" summary messages, and car routes with live traffic.

Every feature is off until its keys exist, and the rest of the app works without it.
Kakao tokens live only in HttpOnly cookies scoped to /api/kakao; JS never sees them.

Env:
  KAKAO_REST_API_KEY      Kakao Developers REST API key (login + messages)
  KAKAO_CLIENT_SECRET     optional, if "Client Secret" is enabled in the Kakao app
  KAKAO_REDIRECT_URI      https://<backend>/api/kakao/callback (registered in the Kakao app)
  KAKAO_RETURN_URL        where to send the browser after login (the frontend), e.g. http://localhost:5173/
  KAKAO_MOBILITY_KEY      Kakao Mobility key for routes (falls back to KAKAO_REST_API_KEY)
  KAKAO_ROUTE_URL         waypoints-directions endpoint (default below)
"""
import hashlib
import hmac
import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import accounts

router = APIRouter(prefix="/api/kakao")
TOKEN = "depart_kakao"
STATE = "depart_kakao_state"
ROUTE_URL = "https://apis-navi.kakaomobility.com/v1/waypoints/directions"
# traffic_state -> UI level (Kakao: 0 unknown, 1 jam, 2 slow, 3 slower, 4 smooth, 6 accident/closed)
TRAFFIC = {1: "jam", 2: "slow", 3: "slow", 4: "smooth", 6: "jam"}
_route_cache = {}


def rest_key():
    return os.getenv("KAKAO_REST_API_KEY", "")


def secure():
    return bool(os.getenv("VERCEL"))


def return_url(status):
    base = os.getenv("KAKAO_RETURN_URL") or "http://localhost:5173/"
    return base + ("&" if "?" in base else "?") + "kakao=" + status


@router.get("/config")
def config(request: Request, response: Response):
    accounts.no_cache(response)
    return {
        "login": bool(rest_key() and os.getenv("KAKAO_REDIRECT_URI") and os.getenv("SUPABASE_URL")),
        "route": bool(os.getenv("KAKAO_MOBILITY_KEY") or rest_key()),
        "connected": bool(request.cookies.get(TOKEN)),  # Kakao token present -> can send messages
    }


@router.get("/login")
def login():
    if not (rest_key() and os.getenv("KAKAO_REDIRECT_URI")):
        raise HTTPException(503, "카카오 로그인 설정 전이에요.")
    state = secrets.token_urlsafe(24)
    url = "https://kauth.kakao.com/oauth/authorize?" + urlencode({
        "client_id": rest_key(), "redirect_uri": os.getenv("KAKAO_REDIRECT_URI"), "response_type": "code",
        "state": state, "scope": "profile_nickname,talk_message",
    })
    response = RedirectResponse(url, status_code=302)
    accounts.no_cache(response)
    response.set_cookie(STATE, state, max_age=600, httponly=True, secure=secure(), samesite="lax", path="/api/kakao")
    return response


def kakao_password(kakao_id):
    """Server-only derived secret for the Supabase twin of a Kakao user (never stored or shown)."""
    _, key = accounts.settings()
    return hmac.new(key.encode(), f"kakao:{kakao_id}".encode(), hashlib.sha256).hexdigest()


async def send_memo(token, template):
    async with httpx.AsyncClient(timeout=10) as client:
        return await client.post("https://kapi.kakao.com/v2/api/talk/memo/default/send",
                                 headers={"Authorization": f"Bearer {token}"},
                                 data={"template_object": json.dumps(template, ensure_ascii=False)})


def site_link():
    base = (os.getenv("KAKAO_RETURN_URL") or "http://localhost:5173/").split("?")[0]
    return {"web_url": base, "mobile_web_url": base}


@router.get("/callback")
async def callback(request: Request, code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(return_url("cancel"), status_code=302)
    if not state or not hmac.compare_digest(state, request.cookies.get(STATE, "")):
        return RedirectResponse(return_url("error"), status_code=302)
    form = {"grant_type": "authorization_code", "client_id": rest_key(),
            "redirect_uri": os.getenv("KAKAO_REDIRECT_URI"), "code": code}
    if os.getenv("KAKAO_CLIENT_SECRET"):
        form["client_secret"] = os.getenv("KAKAO_CLIENT_SECRET")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token = (await client.post("https://kauth.kakao.com/oauth/token", data=form)).raise_for_status().json()
            me = (await client.get("https://kapi.kakao.com/v2/user/me",
                                   headers={"Authorization": f"Bearer {token['access_token']}"})).raise_for_status().json()
    except (httpx.HTTPError, KeyError, ValueError):
        return RedirectResponse(return_url("error"), status_code=302)

    kakao_id = str(me["id"])
    nickname = ((me.get("properties") or {}).get("nickname") or "카카오 여행자")[:24]
    username = f"kakao_{kakao_id}"
    email, password = accounts.identity(username), kakao_password(kakao_id)
    joined = False
    result = await accounts.supa("POST", "/auth/v1/token?grant_type=password", json={"email": email, "password": password})
    if result.status_code != 200:  # first Kakao login: create the account, then sign in
        created = await accounts.supa("POST", "/auth/v1/admin/users", json={
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"username": username, "nickname": nickname, "provider": "kakao"}})
        if created.status_code not in (200, 201):
            return RedirectResponse(return_url("error"), status_code=302)
        joined = True
        result = await accounts.supa("POST", "/auth/v1/token?grant_type=password", json={"email": email, "password": password})
        if result.status_code != 200:
            return RedirectResponse(return_url("error"), status_code=302)

    status = "login"
    if joined and "talk_message" in (token.get("scope") or ""):
        welcome = {"object_type": "text", "link": site_link(), "button_title": "DePartner 열기",
                   "text": f"{nickname}님, DePartner에 카카오로 가입했어요 🌊\n동해 여행 계획을 저장하면 이곳 '나와의 채팅'으로 요약을 보내드릴게요."}
        sent = await send_memo(token["access_token"], welcome)
        status = "joined_sent" if sent.status_code == 200 else "joined"
    elif joined:
        status = "joined"

    response = RedirectResponse(return_url(status), status_code=302)
    accounts.cookies(response, result.json())
    response.set_cookie(TOKEN, token["access_token"], max_age=int(token.get("expires_in", 21599)),
                        httponly=True, secure=secure(), samesite="lax", path="/api/kakao")
    response.delete_cookie(STATE, path="/api/kakao")
    return response


class Row(BaseModel):
    time: str = Field(min_length=1, max_length=8)      # "10:01"
    name: str = Field(min_length=1, max_length=40)


class Memo(BaseModel):
    """A plan "receipt" for the user's own KakaoTalk (feed template + item list)."""
    title: str = Field(min_length=1, max_length=60)           # "망상해변 바다 여행"
    subtitle: str = Field(min_length=1, max_length=40)        # "11/23(월) 10:00–18:00"
    description: str = Field(max_length=200)                  # activities · weather
    rows: list[Row] = Field(default_factory=list, max_length=5)  # visit order (Kakao shows up to 5)
    summary: str = Field(max_length=40)                       # "4곳 · 식사 1회"
    image: str = Field(default="", max_length=500)
    url: str = Field(max_length=4000)                         # reopens this exact plan
    brief_url: str = Field(default="", max_length=4000)       # reopens the sea briefing


def clip(text, n):
    return text if len(text) <= n else text[: n - 1] + "…"


def memo_template(body, base):
    """Kakao "feed" message. Links and images stay on our registered domain."""
    own = lambda u: u if u.startswith(base) else base
    # Tapping anywhere on the card opens the landing screen (?home skips any saved journey draft);
    # the single button jumps to the sea briefing (step 3, the same page the QR code opens).
    home = base + "?home"
    link = {"web_url": home, "mobile_web_url": home}
    brief = {"web_url": own(body.brief_url or body.url), "mobile_web_url": own(body.brief_url or body.url)}
    content = {"title": clip(body.title, 40), "description": clip(body.description, 120), "link": link}
    if body.image.startswith(base):
        content.update(image_url=body.image, image_width=800, image_height=400)
    return {
        "object_type": "feed",
        "content": content,
        "item_content": {
            "profile_text": "DePartner · 동해 바다 여행",
            "title_image_text": clip(body.subtitle, 24),
            "title_image_category": "나의 여행 계획",
            "items": [{"item": clip(r.time, 6), "item_op": clip(r.name, 14)} for r in body.rows[:5]],
            "sum": "일정",
            "sum_op": clip(body.summary, 14),
        },
        "buttons": [{"title": "여행 계획으로 바로가기", "link": brief}],
    }


@router.post("/memo")
async def memo(body: Memo, request: Request, response: Response):
    accounts.origin_check(request)
    accounts.no_cache(response)
    token = request.cookies.get(TOKEN)
    if not token:
        raise HTTPException(401, "카카오로 로그인하면 카카오톡으로 보낼 수 있어요.")
    sent = await send_memo(token, memo_template(body, site_link()["web_url"]))
    if sent.status_code == 200:
        return {"ok": True}
    if sent.status_code in (401, 403):
        raise HTTPException(403, "카카오톡 메시지 보내기 동의가 필요해요. 카카오로 다시 로그인해 주세요.")
    raise HTTPException(502, "카카오톡으로 보내지 못했어요. 잠시 후 다시 시도해 주세요.")


class RouteRequest(BaseModel):
    points: list[tuple[float, float]] = Field(min_length=2, max_length=30)  # [lat, lng] in visit order


def simplify(route):
    """Kakao route -> legs (per section) + traffic segments [{level, path:[[lat,lng]...]}]."""
    legs, segments = [], []
    for leg, section in enumerate(route.get("sections", [])):  # one section per stop-to-stop leg
        legs.append({"distance": section.get("distance"), "duration": section.get("duration")})
        for road in section.get("roads", []):
            v = road.get("vertexes", [])
            path = [[v[i + 1], v[i]] for i in range(0, len(v) - 1, 2)]
            level = TRAFFIC.get(road.get("traffic_state"), "unknown")
            last = segments[-1] if segments else None
            if last and last["leg"] == leg and last["level"] == level and last["path"][-1] == path[0]:
                last["path"] += path[1:]
            elif path:
                segments.append({"level": level, "path": path, "leg": leg})
    summary = route.get("summary", {})
    return {"distance": summary.get("distance"), "duration": summary.get("duration"), "legs": legs, "segments": segments}


@router.post("/route")
async def route(body: RouteRequest, response: Response):
    accounts.no_cache(response)
    key = os.getenv("KAKAO_MOBILITY_KEY") or rest_key()
    if not key:
        raise HTTPException(503, "카카오 길찾기 설정 전이에요.")
    cache_key = json.dumps(body.points)
    hit = _route_cache.get(cache_key)
    if hit and time.monotonic() - hit[0] < 120:  # traffic changes; reuse for 2 minutes only
        return hit[1]
    pts = [{"x": lng, "y": lat} for lat, lng in body.points]
    payload = {"origin": pts[0], "destination": pts[-1], "waypoints": pts[1:-1], "priority": "RECOMMEND", "summary": False}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post(os.getenv("KAKAO_ROUTE_URL") or ROUTE_URL, json=payload,
                                  headers={"Authorization": f"KakaoAK {key}"})
        if r.status_code in (401, 403):
            raise HTTPException(503, "카카오 길찾기 사용 권한을 확인해 주세요.")
        r.raise_for_status()
        found = r.json()["routes"][0]
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        raise HTTPException(502, "실시간 경로를 불러오지 못했어요.") from None
    if found.get("result_code") not in (0, None):
        raise HTTPException(422, found.get("result_msg") or "경로를 찾지 못했어요.")
    answer = {**simplify(found), "checked_at": int(time.time())}
    _route_cache[cache_key] = (time.monotonic(), answer)
    if len(_route_cache) > 100:
        _route_cache.pop(next(iter(_route_cache)))
    return answer


# ── Kakao Local: lodging search + nearby convenience stores / parking ──
# KAKAO_LOCAL_KEY lets a different Kakao app (with 카카오맵 enabled) serve these calls.
LOCAL = "https://dapi.kakao.com/v2/local/search/"
NEARBY_KINDS = {"convenience": "CS2", "parking": "PK6"}
_local_cache = {}
DONGHAE = (37.5247, 129.1143)


def local_key():
    return os.getenv("KAKAO_LOCAL_KEY") or rest_key()


async def local_get(kind, params):
    key = local_key()
    if not key:
        raise HTTPException(503, "카카오 장소 검색 설정 전이에요.")
    cache_key = kind + json.dumps(params, sort_keys=True)
    hit = _local_cache.get(cache_key)
    if hit and time.monotonic() - hit[0] < 600:
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get((os.getenv("KAKAO_LOCAL_URL") or LOCAL) + kind + ".json", params=params, headers={"Authorization": f"KakaoAK {key}"})
    except httpx.HTTPError:
        raise HTTPException(502, "카카오 장소 정보를 불러오지 못했어요.") from None
    if r.status_code in (401, 403):
        raise HTTPException(503, "카카오맵(로컬) 사용 설정을 확인해 주세요.")
    if r.status_code != 200:
        raise HTTPException(502, "카카오 장소 정보를 불러오지 못했어요.")
    data = r.json()
    _local_cache[cache_key] = (time.monotonic(), data)
    if len(_local_cache) > 300:
        _local_cache.pop(next(iter(_local_cache)))
    return data


def place(d):
    return {"id": d.get("id"), "name": d.get("place_name", ""), "address": d.get("road_address_name") or d.get("address_name", ""),
            "category": (d.get("category_name") or "").split(" > ")[-1], "lat": float(d["y"]), "lng": float(d["x"]),
            "distance": int(d["distance"]) if str(d.get("distance") or "").isdigit() else None, "url": d.get("place_url")}


@router.get("/places")
async def places(q: str, response: Response):
    """Keyword search biased to Donghae (for picking the traveller's lodging)."""
    accounts.no_cache(response)
    q = q.strip()[:40]
    if len(q) < 2:
        raise HTTPException(422, "두 글자 이상 입력해 주세요.")
    data = await local_get("keyword", {"query": q, "y": DONGHAE[0], "x": DONGHAE[1], "radius": 20000, "size": 8, "sort": "accuracy"})
    return {"items": [place(d) for d in data.get("documents", [])]}


@router.get("/nearby")
async def nearby(lat: float, lng: float, kind: str, response: Response, radius: int = 500):
    """Nearest convenience stores or parking lots around a point (sorted by distance)."""
    accounts.no_cache(response)
    if kind not in NEARBY_KINDS or not (33 <= lat <= 39 and 124 <= lng <= 132):
        raise HTTPException(422, "요청 값을 확인해 주세요.")
    radius = max(100, min(radius, 2000))
    data = await local_get("category", {"category_group_code": NEARBY_KINDS[kind], "y": round(lat, 5), "x": round(lng, 5),
                                        "radius": radius, "sort": "distance", "size": 5})
    return {"count": (data.get("meta") or {}).get("total_count", 0), "radius": radius,
            "items": [place(d) for d in data.get("documents", [])]}
