"""One real LLM call to confirm the key, model and parameters work.

Run inside backend:  .venv\\Scripts\\python check_llm.py
Costs a single small request. Never prints the key.
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from app import ai  # noqa: E402  (after .env is loaded)


async def main():
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")):
        print("[미설정] backend/.env 에 OPENAI_API_KEY 가 없습니다.")
        return
    model = os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or ai.DEFAULT_MODEL
    print(f"모델: {model} / reasoning_effort: {os.getenv('LLM_REASONING_EFFORT') or 'low'}")
    result, status = await ai.select_json(
        {"reasons": ["파고 1.5m: 주의 예시 임계값 이상", "풍속 9.4m/s: 주의 예시 임계값 이상"]},
        '중요한 근거의 인덱스를 골라 {"reason_indices":[0]} 형식의 JSON만 반환하세요.',
    )
    if status == "ok":
        print("[성공] AI 응답:", result)
    else:
        print(f"[실패] 상태: {status} - 위에 찍힌 경고 로그(상태 코드·오류 메시지)를 확인하세요.")


asyncio.run(main())
