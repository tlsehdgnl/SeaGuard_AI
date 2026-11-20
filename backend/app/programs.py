import asyncio
import re
from datetime import date, datetime, timedelta, timezone

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException

router = APIRouter()
LIST = "https://www.donghaelib.go.kr/web/menu/10027/program/30010/lectureList.do"
KST = timezone(timedelta(hours=9))


def parse_programs(html, today):
    page = BeautifulSoup(html, "html.parser")
    rows = page.select(".article-item")
    if not rows and not re.search(r"검색결과\s*총\s*0\s*건", page.get_text(" ", strip=True)):
        raise ValueError("Unknown listing format")
    programs = []
    for row in rows:
        title = row.select_one("a.title")
        fields = {}
        for paragraph in row.select(".info-info p"):
            key, _, value = " ".join(paragraph.stripped_strings).partition(":")
            fields[key.strip()] = " ".join(value.split())
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", fields.get("강좌기간", ""))
        if not dates or not title:
            raise ValueError("Missing program fields")
        if dates[-1] < today:
            continue
        identifier = re.search(r"fnDetail\('(\d+)'\)", title.get("onclick", ""))
        branch = row.select_one(".lib")
        status = row.select_one(".status")
        label = status.get_text(strip=True) if status else "원문 확인"
        is_open = "".join(label.split()) in {"접수중", "신청중", "모집중"}
        days_left = None
        deadline = re.search(r"(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?$", fields.get("접수기간", ""))
        if is_open and deadline:
            days_left = (date.fromisoformat(deadline[1]) - date.fromisoformat(today)).days
            if days_left < 0:
                label, is_open, days_left = "접수종료", False, None
        programs.append(dict(title=title.get_text(strip=True), branch=branch.get_text(strip=True) if branch else "",
                             start_date=dates[0], period=fields["강좌기간"], hours=fields.get("강좌시간"), place=fields.get("장소"),
                             registration=fields.get("접수기간"), status=label, is_open=is_open, days_left=days_left,
                             url=LIST.replace("lectureList.do","lectureDetail.do?lectureIdx="+identifier[1]) if identifier else LIST))
    return programs


def sort_programs(programs):
    programs.sort(key=lambda program: program["start_date"], reverse=True)
    return sorted(programs, key=lambda p: (not p["is_open"], p["days_left"] if p["days_left"] is not None else float("inf")))


FILTERS = {"apply": "접수중", "wait": "대기접수", "ready": "접수예정"}


async def read_listing(client, today, category=None):
    items = []
    seen = set()
    for number in range(1, 21):
        params = {"searchStatusCd": category, "currentPageNo": number} if category else {}
        response = await client.get(LIST, params=params)
        response.raise_for_status()
        html = response.text
        if not category:
            return parse_programs(html, today)
        page = BeautifulSoup(html, "html.parser")
        selected = page.select_one("#searchStatusCd option[selected]")
        total = page.select_one(".total b")
        if not selected or selected.get("value") != category or not total:
            raise ValueError("Unconfirmed search filter")
        count = int(total.get_text(strip=True).replace(",", ""))
        rows = page.select(".article-item")
        for row in rows:
            link = row.select_one("a.title")
            match = re.search(r"fnDetail\('(\d+)'\)", link.get("onclick", "")) if link else None
            if not match or match[1] in seen:
                raise ValueError("Incomplete pagination")
            seen.add(match[1])
        items.extend(parse_programs(html, today))
        if len(seen) == count:
            return items
        if not rows or len(seen) > count:
            break
    raise ValueError("Incomplete listing")


@router.get("/api/programs")
async def programs():
    today = datetime.now(KST).date().isoformat()
    categories = [None, *FILTERS]
    async with httpx.AsyncClient(timeout=8) as client:
        results = await asyncio.gather(*(
            asyncio.wait_for(read_listing(client, today, category), timeout=15)
            for category in categories
        ), return_exceptions=True)
    combined = {}
    missing = []
    for category, result in zip(categories, results):
        if isinstance(result, (ValueError, httpx.HTTPError, TimeoutError)):
            missing.append(FILTERS.get(category, "최근 공지"))
            continue
        if isinstance(result, BaseException):
            raise result
        for item in result:
            combined[(item["url"], item["title"])] = item
    if len(missing) == len(categories):
        raise HTTPException(503, detail={"message":"도서관 일정을 불러올 수 없습니다."})
    items = sort_programs(list(combined.values()))
    return {"items": items, "checked_at": datetime.now(KST).isoformat(),
            "missing": missing, "open_count": None if FILTERS["apply"] in missing else sum(p["is_open"] for p in items)}
