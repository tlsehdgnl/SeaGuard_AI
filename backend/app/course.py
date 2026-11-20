import asyncio
import json
import math
import platform
import shutil
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .ai import select_json

router = APIRouter()
local_slot = asyncio.Semaphore(1)


class Stop(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    detail: str = Field(max_length=200)
    required: bool = False
    point: tuple[float, float] | None = None


class Course(BaseModel):
    start: str = Field(min_length=1, max_length=80)
    activities: str = Field(max_length=200)
    conditions: str = Field(max_length=300)
    weather: str = Field(max_length=300)
    candidates: list[Stop] = Field(min_length=1, max_length=150)
    extras: int = Field(ge=0, le=150)
    origin: tuple[float, float] | None = None


async def device_order(payload):
    if platform.system() != "Darwin" or not shutil.which("swift") or local_slot.locked():
        return None
    async with local_slot:
        process = await asyncio.create_subprocess_exec(
            "swift", str(Path(__file__).with_name("local_course.swift")),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL)
        try:
            output, _ = await asyncio.wait_for(process.communicate(json.dumps(
                payload, ensure_ascii=False).encode()), timeout=25)
            return json.loads(output) if process.returncode == 0 else None
        except (TimeoutError, ValueError):
            return None
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()


def improve_distance(course, ordered):
    # Fixed origin, open-ended itinerary. Compare geographic distance in a local projection.
    if not course.origin or any(not course.candidates[i].point for i in ordered):
        return ordered
    scale = math.cos(math.radians(course.origin[0]))
    points = [stop.point for stop in course.candidates] + [course.origin]

    def distance(i, j):
        a, b = points[i], points[j]
        return math.hypot(a[0] - b[0], (a[1] - b[1]) * scale)

    route = ordered.copy()
    # A reversal changes only the two edges at its ends.
    for _ in range(len(route)):
        improved = False
        for i in range(len(route) - 1):
            prev = route[i-1] if i else -1
            for j in range(i+1, len(route)):
                gain = distance(prev, route[i]) - distance(prev, route[j])
                if j+1 < len(route):
                    nxt = route[j+1]
                    gain += distance(route[j], nxt) - distance(route[i], nxt)
                if gain > 1e-9:
                    route[i:j+1] = reversed(route[i:j+1])
                    improved = True
        if not improved:
            break
    return route


@router.post("/api/course")
async def plan_course(course: Course):
    required = [i for i, stop in enumerate(course.candidates) if stop.required]
    optional = [i for i, stop in enumerate(course.candidates) if not stop.required]
    visits = required + optional[:course.extras]
    if not visits:
        return {"order": [], "source": "basic"}
    payload = {"origin": course.origin, "start": course.start, "activities": course.activities,
               "conditions": course.conditions, "weather": course.weather,
               "stops": [{"id": i, "name": course.candidates[i].name, "point": course.candidates[i].point}
                         for i in visits]}
    instruction = ('모든 stops의 id를 한 번씩 포함하여 출발지에서 되돌아가는 이동이 적은 관광 순서를 '
                   '정하세요. 활동·조건과 좌표를 고려하세요. {"order":[정수 id]}만 반환하세요.')
    result, _ = await select_json(payload, instruction)
    proposed = result.get("order") if result else None
    if proposed is None:
        proposed = await device_order(payload)
    # Keep valid model priorities and recover any omitted indices before distance refinement.
    valid = list(dict.fromkeys(i for i in proposed if type(i) is int and i in visits)) if isinstance(proposed, list) else []
    ordered = valid + [i for i in visits if i not in valid]
    return {"order": improve_distance(course, ordered), "source": "ai" if valid else "basic"}
