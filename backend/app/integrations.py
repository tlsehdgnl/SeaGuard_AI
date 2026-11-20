"""Admin-only, bounded connectivity diagnostics. Never return credential values."""
import asyncio
import hashlib
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx
from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel
from .ai import OPENAI_URL, DEFAULT_MODEL, request_body
from .fishing import API_URL, extract_items
from .programs import LIST, parse_programs

router = APIRouter(prefix='/api/admin')
_cache = {}
_lock = asyncio.Lock()


def require_admin(authorization):
    token=os.getenv('ADMIN_TOKEN')
    if not token: raise HTTPException(503,'관리자 키 설정이 필요합니다.')
    if not secrets.compare_digest(authorization.encode(),('Bearer '+token).encode()):
        raise HTTPException(401,'관리자 접속키를 확인하세요.')


class CheckRequest(BaseModel):
    test_generation: bool = False


def item(id, name, status, detail, configured=True, **extra):
    return dict(id=id,name=name,status=status,detail=detail,configured=configured,**extra)


def failure_status(response):
    return 'auth_error' if response.status_code in (401,403) else 'rate_limited' if response.status_code==429 else 'error'


async def gpt(client, deep):
    key=os.getenv('OPENAI_API_KEY') or os.getenv('LLM_API_KEY')
    is_openai=bool(os.getenv('OPENAI_API_KEY'))
    model=(os.getenv('OPENAI_MODEL') if is_openai else os.getenv('LLM_MODEL')) or DEFAULT_MODEL
    endpoint=OPENAI_URL if is_openai else os.getenv('LLM_API_URL','')
    name='OpenAI GPT' if is_openai or not key else 'LLM provider'
    if not key: return item('gpt',name,'missing','key_missing',False,model=model)
    if not endpoint.startswith('https://'):return item('gpt',name,'error','endpoint_invalid',model=model)
    headers={'Authorization':'Bearer '+key}
    if deep:
        body=request_body(model,'Return JSON only: {"ok":true}.',{'purpose':'admin_connection_check'})
        body['max_completion_tokens']=300
        r=await client.post(endpoint,headers=headers,json=body,timeout=35)
        if r.is_error:return item('gpt',name,failure_status(r),'generation_failed',http_status=r.status_code,model=model)
        raw=r.json()['choices'][0]['message']['content']
        if json.loads(raw).get('ok') is not True:raise ValueError('invalid model response')
        return item('gpt',name,'ok','generation_ok',model=model)
    if not is_openai:return item('gpt',name,'unchecked','generation_required',model=model)
    r=await client.get('https://api.openai.com/v1/models',headers=headers)
    if r.is_error:return item('gpt',name,failure_status(r),'auth_failed',http_status=r.status_code,model=model)
    available={m['id'] for m in r.json()['data']}
    return item('gpt',name,'ok' if model in available else 'error','model_access_ok' if model in available else 'model_missing',model=model)


async def fishing(client):
    key=os.getenv('FISHING_API_KEY')
    if not key:return item('fishing','국립해양조사원 낚시 API','missing','key_missing',False)
    r=await client.get(API_URL,params={'serviceKey':key,'type':'json','gubun':'갯바위','numOfRows':1,'pageNo':1})
    if r.is_error:return item('fishing','국립해양조사원 낚시 API',failure_status(r),'provider_error',http_status=r.status_code)
    payload=r.json();header=payload.get('response',payload).get('header',{})
    if str(header.get('resultCode')) not in ('00','0'):
        return item('fishing','국립해양조사원 낚시 API','error','provider_rejected')
    rows=extract_items(payload)
    return item('fishing','국립해양조사원 낚시 API','ok' if rows else 'warning','data_received' if rows else 'no_data')


async def forecast(client, marine=False):
    id='marine' if marine else 'weather';name='Open-Meteo 해양 예보' if marine else 'Open-Meteo 기상 예보'
    url='https://marine-api.open-meteo.com/v1/marine' if marine else 'https://api.open-meteo.com/v1/forecast'
    field='wave_height' if marine else 'temperature_2m'
    r=await client.get(url,params={'latitude':37.593,'longitude':129.09,'current':field,'timezone':'Asia/Seoul'})
    if r.is_error:return item(id,name,failure_status(r),'provider_error',http_status=r.status_code,key_required=False)
    data=r.json()['current']
    if type(data.get(field)) not in (int,float): raise ValueError('no numeric observation')
    stamp=datetime.fromisoformat(data['time']).replace(tzinfo=timezone.utc).timestamp()-9*3600
    fresh=abs(time.time()-stamp)<10800
    return item(id,name,'ok' if fresh else 'warning','data_received' if fresh else 'stale_data',key_required=False)


async def library(client):
    r=await client.get(LIST,follow_redirects=True)
    if r.is_error:return item('library','동해시 도서관 일정',failure_status(r),'provider_error',http_status=r.status_code,key_required=False)
    parse_programs(r.text,datetime.now(timezone(timedelta(hours=9))).date().isoformat())
    return item('library','동해시 도서관 일정','ok','format_verified',key_required=False)


def database_check():
    url=os.getenv('TRAIL_DATABASE_URL')
    if not url and os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SECRET_KEY'):
        from .supabase_stats import call
        call('rpc/depart_usage_stats',{'p_from':0,'p_to':0,'p_demo':-1})
        return item('database','통계 데이터베이스','ok','database_ok',storage='GLAB · Supabase PostgreSQL')
    if not url and os.getenv('VERCEL'):return item('database','통계 데이터베이스','missing','database_missing',False)
    if url:
        import psycopg
        with psycopg.connect(url,connect_timeout=5,options='-c statement_timeout=5000',prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                if os.getenv('SEAGUARD_PRIVATE_SCHEMA','SUPABASE_URL','SUPABASE_SECRET_KEY')=='1':cur.execute('SET LOCAL search_path TO seaguard, pg_catalog')
                for table in ('events','plan_context','trail'):cur.execute(f'SELECT 1 FROM {table} LIMIT 0')
        return item('database','통계 데이터베이스','ok','database_ok',storage='PostgreSQL')
    path=Path(os.getenv('TRAIL_DB_PATH') or Path.home()/'.seaguard'/'trails.sqlite3')
    if not path.exists():return item('database','통계 데이터베이스','warning','local_database_missing',storage='SQLite')
    conn=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=5)
    try:
        for table in ('events','plan_context','trail'):conn.execute(f'SELECT 1 FROM {table} LIMIT 0')
    finally:conn.close()
    return item('database','통계 데이터베이스','ok','local_database_ok',storage='SQLite')


async def supabase_check(client):
    url,key=os.getenv('SUPABASE_URL'),os.getenv('SUPABASE_SECRET_KEY')
    if not url or not key:return item('supabase','Supabase 회원·장소 저장소','missing','key_missing',False)
    for table in ('depart_saved_plans','depart_catalog','depart_imports'):
        r=await client.get(url.rstrip('/')+'/rest/v1/'+table,params={'select':'*','limit':'0'},headers={'apikey':key})
        if r.is_error:return item('supabase','Supabase 회원·장소 저장소',failure_status(r),'provider_error',http_status=r.status_code)
    return item('supabase','Supabase 회원·장소 저장소','ok','database_ok',storage='GLAB · Supabase')


async def guarded(id,name,operation):
    started=time.monotonic()
    try: result=await operation()
    except (httpx.TimeoutException,TimeoutError):result=item(id,name,'timeout','timeout')
    except Exception:result=item(id,name,'error','check_failed')
    result['latency_ms']=round((time.monotonic()-started)*1000)
    result['checked_at']=datetime.now(timezone.utc).isoformat()
    return result


@router.post('/integrations/check')
async def check_integrations(body:CheckRequest,response:Response,authorization:str=Header(default='')):
    require_admin(authorization)
    response.headers['Cache-Control']='no-store'
    names=('OPENAI_API_KEY','OPENAI_MODEL','LLM_API_KEY','LLM_API_URL','LLM_MODEL','FISHING_API_KEY','TRAIL_DATABASE_URL','TRAIL_DB_PATH','VERCEL','SEAGUARD_PRIVATE_SCHEMA','SUPABASE_URL','SUPABASE_SECRET_KEY')
    fingerprint=hashlib.sha256(json.dumps([os.getenv(k) for k in names]+[body.test_generation]).encode()).hexdigest()
    async with _lock:
        cached=_cache.get(fingerprint)
        if cached and time.monotonic()-cached[0]<30:return {**cached[1],'cached':True}
        async with httpx.AsyncClient(timeout=12) as client:
            rows=await asyncio.gather(
                guarded('gpt','GPT',lambda:gpt(client,body.test_generation)),
                guarded('fishing','국립해양조사원 낚시 API',lambda:fishing(client)),
                guarded('weather','Open-Meteo 기상 예보',lambda:forecast(client)),
                guarded('marine','Open-Meteo 해양 예보',lambda:forecast(client,True)),
                guarded('library','동해시 도서관 일정',lambda:library(client)),
                guarded('supabase','Supabase 회원·장소 저장소',lambda:supabase_check(client)),
                guarded('database','통계 데이터베이스',lambda:asyncio.to_thread(database_check)))
        rows.insert(0,item('admin','관리자 인증','ok','admin_authenticated',checked_at=datetime.now(timezone.utc).isoformat(),latency_ms=0))
        result={'services':rows,'checked_at':datetime.now(timezone.utc).isoformat(),'generation_tested':body.test_generation,'cached':False,'cache_seconds':30,'environment':'production' if os.getenv('VERCEL') else 'local'}
        if len(_cache)>=8:_cache.pop(next(iter(_cache)))
        _cache[fingerprint]=(time.monotonic(),result)
        return result
