"""Runs the Donghae fishing analysis (for 묵호항) against the live KHOA API.

Run inside backend:  .venv\\Scripts\\python check_fishing.py
Never prints the key.
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from app import fishing  # noqa: E402


async def main():
    key = os.getenv("FISHING_API_KEY")
    if not key:
        print("[미설정] backend/.env 에 FISHING_API_KEY 가 없습니다.")
        return
    try:
        rows = await fishing.fetch_all()
    except Exception as exc:  # show the reason, never the key
        print(f"[실패] {type(exc).__name__}: {str(exc)[:300].replace(key, '***')}")
        return
    print(f"[성공] 전국 {len(rows)}행 수신")
    report = fishing.analyze(rows, {"latitude": 37.552, "longitude": 129.1155})
    if not report:
        print("동해 인근 해역에 공식 지점이 없습니다.")
        return
    print("  이번 주:", " / ".join(f"{w['label']} {w['index']}" for w in report["week"]))
    print("  어종별:", ", ".join(f"{s['species']} {s['when']} {s['index']}" for s in report["species"]))
    print("  기대 어종:", report["local_species"], "수온", report["local_water_temp"])


asyncio.run(main())
