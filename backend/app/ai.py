"""Bounded, instance-local JSON selection client. Never render raw model prose."""
import json
import logging
import os
import time
from collections import OrderedDict, deque

import httpx

log = logging.getLogger("seaguard.ai")
OPENAI_URL ="https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-6-astra"

_cache = OrderedDict()
_calls = deque()
_inflight = 0


def request_body(model, instruction, payload):
    """GPT-6 Astra rejects `temperature`; it takes `reasoning_effort` instead (none is unsupported)."""
    body = {
        "model": model, "max_completion_tokens": int(os.getenv("LLM_MAX_TOKENS") or 3000),
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": instruction},
                     {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    }
    effort = os.getenv("LLM_REASONING_EFFORT") or "low"
    if effort != "off":  # "off" for OpenAI-compatible providers without reasoning models
        body["reasoning_effort"] = effort
    return body


async def select_json(payload, instruction):
    global _inflight
    key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
    endpoint = OPENAI_URL if os.getenv("OPENAI_API_KEY") else os.getenv("LLM_API_URL")
    if not key or not endpoint:
        return None, "disabled"
    if not endpoint.startswith("https://"):
        return None, "failed"
    model = (os.getenv("OPENAI_MODEL") if os.getenv("OPENAI_API_KEY") else os.getenv("LLM_MODEL")) or DEFAULT_MODEL
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
            response = await client.post(endpoint, headers={"Authorization": f"Bearer {key}"},
                                         json=request_body(model, instruction, payload))
        if response.is_error:
            # Status and provider message only; never the key. Shows up in uvicorn / Vercel logs.
            log.warning("LLM %s returned %s: %s", model, response.status_code, response.text[:300])
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
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        log.warning("LLM call failed, using rule fallback: %s", type(exc).__name__)
        return None, "failed"
    finally:
        _inflight -= 1
