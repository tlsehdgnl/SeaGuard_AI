import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import HTTPException


@contextmanager
def database():
    url = os.getenv("TRAIL_DATABASE_URL")
    if url:
        import psycopg
        conn = psycopg.connect(url, connect_timeout=5, prepare_threshold=None)
        placeholder = "%s"
    else:
        if os.getenv("VERCEL"):
            raise HTTPException(503, "동선 저장소 연결이 필요합니다.")
        path = Path(os.getenv("TRAIL_DB_PATH") or Path.home() / ".seaguard" / "trails.sqlite3")
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, timeout=8)
        placeholder = "?"
    try:
        def query(sql, params=()):
            return conn.execute(sql.replace("?", placeholder), params)
        if url and os.getenv("SEAGUARD_PRIVATE_SCHEMA") == "1":
            query("SET LOCAL search_path TO seaguard, pg_catalog")
        else:
            query("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, kind TEXT NOT NULL, beach TEXT NOT NULL, poi_id TEXT NOT NULL, demo INTEGER NOT NULL, created_at BIGINT NOT NULL)")
            query("CREATE TABLE IF NOT EXISTS plan_context (event_id TEXT PRIMARY KEY REFERENCES events(id), start_hour INTEGER NOT NULL, risk TEXT NOT NULL, car INTEGER NOT NULL, travel_date TEXT)")
            query("CREATE TABLE IF NOT EXISTS trail (token TEXT PRIMARY KEY, beach TEXT NOT NULL, weather TEXT NOT NULL, stops TEXT)")
        yield query
        conn.commit()
    finally:
        conn.close()


