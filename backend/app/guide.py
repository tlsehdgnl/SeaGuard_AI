"""Evidence-backed activity guidance and conservative local alternatives."""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from .ai import select_json

CATALOG = json.loads((Path(__file__).parent / "data" / "places.json").read_text(encoding="utf-8"))
KST = timezone(timedelta(hours=9))
OFFICIAL_LINKS = [
    {"id": "weather", "title": "기상청 특보 확인", "url": "https://www.weather.go.kr/w/special-report/overall.do", "description": "동해시·동해 앞바다의 발표 시각과 적용 구역을 확인하세요."},
    {"id": "swell", "title": "기상청 해양기상 · 너울 정보", "url": "https://marine.kma.go.kr", "description": "너울 예측정보에서 해당 해안과 시간대를 직접 확인하세요."},
    {"id": "local", "title": "동해시 관광 공식 안내", "url": "https://www.dh.go.kr/tour/index.do", "description": "현장 통제·안전요원 운영은 현장 안내소에서 별도로 확인하세요."},
]


ACTIVITY_ACTIONS = {
    "walk": "산책 전 출입 제한 구간을 확인하고, 파도가 닿는 갯바위·방파제 등 물가 접근에 유의하세요.",
    "swim": "물놀이 전 입수 통제와 안전요원 운영 여부를 확인하고, 현장 안내에 따르세요.",
    "photo": "해안 산책로나 백사장 안쪽에서 촬영하세요. 구도를 잡으며 뒤로 물러설 때는 발밑을 먼저 확인하세요.",
    "sunrise": "방문 날짜의 동해시 일출 시각을 확인하고, 해 뜨기 전에도 길을 찾을 수 있는 전망 장소를 골라 두세요.",
    "picnic": "돗자리를 펼칠 수 있는 구역을 확인하고, 바람에 날리기 쉬운 포장재는 바로 가방에 담으세요.",
    "cafe": "방문할 카페의 영업시간과 마지막 주문 시각을 확인하세요. 주변 활동에서 카페 위치를 볼 수 있어요.",
    "food": "식당의 휴무일과 주문 마감 시간을 확인하세요. 주변 활동에서 메뉴와 위치를 함께 볼 수 있어요.",
    "cleanup": "집게와 봉투를 준비해 마른 모래사장에서 주워요. 깨진 유리나 주삿바늘은 손대지 말고 관리소에 알려주세요.",
}


def fixed_actions(profile, weather):
    items = [{"id": "official", "text": "공식 특보와 현장 통제·안내판을 먼저 확인하세요. 이 서비스는 입수 가능 여부를 판단하지 않습니다."}]
    if weather is None:
        items.append({"id": "missing", "text": "현재 시간대의 예보를 불러오지 못했어요. 방문 전 기상청에서 최신 날씨를 확인해 주세요."})
    elif weather["meta"]["is_demo"]:
        items.append({"id": "demo", "text": "현재는 고정 예시 시연입니다. 실제 외출 판단에는 외부 예보와 공식 정보를 새로 확인하세요."})
    activities = profile.get("activities") or [profile["activity"]]
    items.extend({"id": activity, "text": ACTIVITY_ACTIONS[activity]} for activity in activities)
    if profile["children"]:
        items.append({"id": "children", "text": "어린이와 함께라면 보호자가 곁에서 동행하고, 아이가 혼자 물가로 접근하지 않도록 살펴주세요."})
    if profile["mobility"] != "any":
        items.append({"id": "mobility", "text": "유모차·보행 보조기구를 이용한다면 계단, 경사로와 목적지 내부 이동 동선을 방문 전에 확인하세요."})
    if "swim" in activities and weather and weather["risk"]["level"] in ("caution", "danger"):
        text = ("입수를 피하고 물가에서 떨어져 현장 통제에 따르세요." if weather["risk"]["level"] == "danger"
                else "물놀이를 자제하고 현장 안전요원의 안내를 확인하세요.")
        items.append({"id": "signal", "text": text + " 실내 활동으로 일정 변경을 검토할 수 있습니다."})
    return items


def recommendations(profile, today=None):
    today = today or datetime.now(KST).date()
    matched, pending, excluded = [], [], []
    for original in CATALOG["places"]:
        place = dict(original)
        reasons, checks = [], []
        if place["id"] in profile.get("exclude", []):
            reasons.append("이 기기에서 다른 후보를 요청한 장소")
        if today.weekday() in place["closed_weekdays"]:
            reasons.append("오늘은 등록된 정기 휴관일")
        if profile["budget"] == "free":
            if place["fee"] == "paid":
                reasons.append("유료 활동이어서 무료 조건과 맞지 않음")
            elif place["fee"] != "free":
                checks.append("무료 이용 가능 여부 확인 필요")
        if profile["mobility"] != "any":
            if place["step_free"] is False:
                reasons.append("계단·좁은 통로 안내가 있어 이동 조건과 맞지 않음")
            elif place["step_free"] is not True:
                checks.append("계단 없는 접근 및 내부 이동 동선 확인 필요")
        if profile["transport"] == "transit":
            # A transit reference is not proof of a viable route from this beach.
            checks.append("출발 해변에서 대중교통 경로·배차·도보 구간 확인 필요")
        if profile["time_budget"] != "any":
            checks.append(f"왕복 이동·대기·활동을 합쳐 {profile['time_budget']}분 안에 가능한지 확인 필요")
        if place["id"] == "forest":
            checks.append("오늘 실내 프로그램 운영·예약 가능 여부 확인 필요")
        if any((today - date.fromisoformat(CATALOG["sources"][sid]["checked_at"])).days > 90 for sid in place["source_ids"]):
            checks.append("자료 확인 후 90일이 지나 최신 정보 재확인 필요")
        place.update({
            "checks": checks, "exclusion_reasons": reasons,
            "match_status": "excluded" if reasons else "needs_check" if checks else "candidate",
            "sources": [CATALOG["sources"][sid] for sid in place["source_ids"]],
            "map_url": "https://map.naver.com/p/search/" + quote(place["address"] + " " + place["name"]),
            "reason": place["facts"][0]["text"],
        })
        (excluded if reasons else pending if checks else matched).append(place)
    return {"candidates": matched, "needs_check": pending, "excluded": excluded,
            "notice": "현재 영업·잔여 정원·이동시간은 실시간 확인하지 않습니다. 출발 전 공식 안내로 재확인하세요.",
            "checked_at": CATALOG["version"]}


def validate_selection(selection, actions, places):
    if not isinstance(selection, dict) or set(selection) != {"action_ids", "recommendations"}:
        raise ValueError("Unexpected fields")
    action_ids, picks = selection["action_ids"], selection["recommendations"]
    allowed = {a["id"] for a in actions}
    if not isinstance(action_ids, list) or not 1 <= len(action_ids) <= len(actions):
        raise ValueError("Invalid actions")
    if any(not isinstance(i, str) or i not in allowed for i in action_ids) or len(set(action_ids)) != len(action_ids):
        raise ValueError("Unknown or duplicate action")
    if not isinstance(picks, list) or len(picks) > 3 or (places and not picks):
        raise ValueError("Invalid picks")
    by_id = {p["id"]: p for p in places}
    seen = set()
    for pick in picks:
        if not isinstance(pick, dict) or set(pick) != {"place_id", "fact_ids"}:
            raise ValueError("Invalid pick fields")
        pid = pick["place_id"]
        if not isinstance(pid, str) or pid not in by_id or pid in seen:
            raise ValueError("Unknown, excluded or duplicate place")
        facts = pick["fact_ids"]
        allowed_facts = {f["id"] for f in by_id[pid]["facts"]}
        if not isinstance(facts, list) or not facts or any(not isinstance(f, str) or f not in allowed_facts for f in facts) or len(set(facts)) != len(facts):
            raise ValueError("Invalid evidence")
        seen.add(pid)
    return selection


async def build_guide(profile, weather, weather_error=None):
    actions = fixed_actions(profile, weather)
    alternatives = recommendations(profile)
    eligible = alternatives["candidates"] + alternatives["needs_check"]
    instruction = ('이용자 조건에 맞춰 제공된 안내와 장소의 우선순위를 고르세요. 자유 문장은 쓰지 마세요. '
                   'JSON 형식은 {"action_ids":["제공된 안내 ID"],"recommendations":'
                   '[{"place_id":"제공된 장소 ID","fact_ids":["그 장소에 속한 근거 ID"]}]} 입니다. '
                   '장소는 최대 3개, 후보가 없으면 빈 목록. 확인 필요 조건을 충족했다고 추정하지 마세요.')
    selection, status = await select_json({"profile": profile, "actions": actions,
        "weather": None if weather is None else {"risk": weather["risk"], "values": weather["values"], "demo": weather["meta"]["is_demo"]},
        "places": [{"id": p["id"], "facts": p["facts"], "checks": p["checks"]} for p in eligible]}, instruction)
    source = "rules"
    if selection is not None:
        try:
            validate_selection(selection, actions, eligible)
            source = "rules+llm"
        except (ValueError, TypeError):
            status, selection = "invalid", None
    if selection is None:
        selection = {"action_ids": [a["id"] for a in actions], "recommendations": [
            {"place_id": p["id"], "fact_ids": [p["facts"][0]["id"]]} for p in eligible[:3]]}
    priority = [a for aid in selection["action_ids"] for a in actions if a["id"] == aid]
    for group in (alternatives["candidates"], alternatives["needs_check"]):
        order = {pick["place_id"]: i for i, pick in enumerate(selection["recommendations"])}
        group.sort(key=lambda p: order.get(p["id"], 99))
        for place in group:
            pick = next((p for p in selection["recommendations"] if p["place_id"] == place["id"]), None)
            if pick:
                place["reason"] = " ".join(f["text"] for f in place["facts"] if f["id"] in pick["fact_ids"])
    notices = {"disabled": "AI 연결 전입니다. 조건과 확인된 자료를 이용한 기본 안내를 제공합니다.",
               "failed": "AI 연결 실패로 기본 안내를 제공합니다.", "invalid": "AI 출력 검증 실패로 기본 안내를 제공합니다.",
               "limited": "AI 요청이 많아 기본 안내를 제공합니다.",
               "ok": "AI가 안내·후보의 우선순위를 선택했습니다. 표시 문장은 등록된 근거로 구성합니다.",
               "cached": "검증된 AI 선택을 재사용했습니다. 현재 조건과 근거를 다시 검사했습니다."}
    return {"profile": profile, "weather": weather, "weather_error": weather_error,
            "state": "information_needed" if weather is None else "demo" if weather["meta"]["is_demo"] else "forecast",
            "actions": actions, "priority_actions": priority, "alternatives": alternatives,
            "official_links": OFFICIAL_LINKS, "ai": {"source": source, "status": status, "notice": notices[status]},
            "generated_at": datetime.now(KST).isoformat(timespec="seconds")}
