"""Bounded, instance-local JSON selection client. Never render raw model prose."""
import json
import os
import time
from collections import OrderedDict, deque

import httpx

_cache = OrderedDict()
_calls = deque()
_inflight = 0


async def select_json(payload, instruction):
    global _inflight
    key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
    endpoint = "https://api.openai.com/v1/chat/completions" if os.getenv("OPENAI_API_KEY") else os.getenv("LLM_API_URL")
    if not key or not endpoint:
        return None, "disabled"
    if not endpoint.startswith("https://"):
        return None, "failed"
    model = (os.getenv("OPENAI_MODEL") or "gpt-4.1-mini") if os.getenv("OPENAI_API_KEY") else (os.getenv("LLM_MODEL") or "configured-model")
    cache_key = json.dumps([endpoint, model, instruction, payload], sort_keys=True, ensure_ascii=False)
    clock = time.monotonic()
    if cache_key in _cache:
        stamp, value = _cache[cache_key]
        if clock - stamp < 300:
            return value, "cached"
        del _cache[cache_key]
    while _calls and clock - _calls[0] >= 60:
        _calls.popleft()
    if len(_calls) >= 12 or _inflight >= 2:
        return None, "limited"
    _calls.append(clock)
    _inflight += 1
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(endpoint, headers={"Authorization": f"Bearer {key}"}, json={
                "model": model, "temperature": 0, "max_completion_tokens": 3000,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": instruction},
                             {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            })
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        if not isinstance(raw, str) or len(raw) > 10000:
            raise ValueError("Invalid JSON response")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("JSON object required")
        _cache[cache_key] = (clock, result)
        while len(_cache) > 64:
            _cache.popitem(last=False)
        return result, "ok"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return None, "failed"
    finally:
        _inflight -= 1
