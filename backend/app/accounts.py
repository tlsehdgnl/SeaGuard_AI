"""Optional username accounts. Supabase tokens stay in HttpOnly cookies, never JS storage."""
import hashlib
import hmac
import json
import os
from datetime import date, datetime, timezone
from uuid import UUID, uuid5, NAMESPACE_URL

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Query
from pydantic import BaseModel, Field, SecretStr, field_validator

router = APIRouter(prefix='/api/account')
ACCESS = 'depart_access'
REFRESH = 'depart_refresh'


def settings():
    url, key = os.getenv('SUPABASE_URL', '').rstrip('/'), os.getenv('SUPABASE_SECRET_KEY', '')
    if not url or not key:
        raise HTTPException(503, '회원 저장소 연결을 준비 중입니다. 로그인 없이 계속 이용할 수 있어요.')
    return url, key


async def supa(method, path, *, token=None, **kwargs):
    url, key = settings()
    headers = {'apikey': key, **kwargs.pop('headers', {})}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            return await client.request(method, url + path, headers=headers, **kwargs)
    except httpx.HTTPError:
        raise HTTPException(503, '회원 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.') from None


def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'


def origin_check(request):
    allowed = set(os.getenv('ACCOUNT_ORIGINS', 'https://departner-donghae.vercel.app,https://seaguard-web.vercel.app').split(','))
    if not os.getenv('VERCEL'):
        allowed.update(f'http://{host}:{port}' for host in ('localhost', '127.0.0.1') for port in (5173,5175,8011))
    if request.headers.get('origin') not in allowed:
        raise HTTPException(403, '허용된 사이트에서 다시 시도해 주세요.')


class Credentials(BaseModel):
    username: str = Field(min_length=4, max_length=24, pattern=r'^[a-zA-Z0-9_]+$')
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator('username')
    @classmethod
    def normalize(cls, value):
        return value.lower()


class Registration(Credentials):
    nickname: str = Field(min_length=2, max_length=24)
    birth_date: date

    @field_validator('nickname')
    @classmethod
    def nickname_valid(cls, value):
        value = value.strip()
        if len(value) < 2 or any(ord(c) < 32 for c in value):
            raise ValueError('닉네임을 확인하세요.')
        return value

    @field_validator('birth_date')
    @classmethod
    def birth_valid(cls, value):
        if not date(1900,1,1) <= value <= date.today():
            raise ValueError('생년월일을 확인하세요.')
        return value


def identity(username):
    # Internal identifier only; never claims a real email address or sends mail.
    return username + '@accounts.departner.invalid'


def public_user(user):
    meta = user.get('user_metadata') or {}
    return {'id':user['id'], 'username':meta.get('username',''), 'nickname':meta.get('nickname','여행자')}


def cookies(response, session):
    no_cache(response)
    for key, value, age in ((ACCESS,session['access_token'],int(session.get('expires_in',3600))), (REFRESH,session['refresh_token'],30*86400)):
        response.set_cookie(key,value,max_age=age,httponly=True,secure=bool(os.getenv('VERCEL')),samesite='lax',path='/api/account')


def clear_cookies(response):
    for key in (ACCESS,REFRESH):
        response.delete_cookie(key,path='/api/account',httponly=True,secure=bool(os.getenv('VERCEL')),samesite='lax')
    no_cache(response)


async def session(request, response):
    no_cache(response)
    token = request.cookies.get(ACCESS)
    if token:
        result = await supa('GET','/auth/v1/user',token=token)
        if result.status_code == 200:
            return result.json(), token
        if result.status_code not in (401,403):
            raise HTTPException(503,'로그인 상태를 확인할 수 없어요. 다시 시도해 주세요.')
    refresh = request.cookies.get(REFRESH)
    if refresh:
        result = await supa('POST','/auth/v1/token?grant_type=refresh_token',json={'refresh_token':refresh})
        if result.status_code == 200:
            data = result.json()
            cookies(response,data)
            return data['user'], data['access_token']
        if result.status_code >= 500:
            raise HTTPException(503,'로그인 상태를 확인할 수 없어요. 다시 시도해 주세요.')
    raise HTTPException(401,'로그인이 필요합니다.')


async def limit(request, username, action):
    _, key = settings()
    ip = request.headers.get('x-vercel-forwarded-for','').split(',')[0] if os.getenv('VERCEL') else (request.client.host if request.client else 'local')
    for raw, maximum in ((f'{action}:ip:{ip}',30),(f'{action}:id:{username}',10)):
        digest = hmac.new(key.encode(),raw.encode(),hashlib.sha256).hexdigest()
        result = await supa('POST','/rest/v1/rpc/depart_auth_attempt',json={'limiter_key':digest,'max_attempts':maximum})
        if result.status_code != 200:
            raise HTTPException(503,'회원 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.')
        if result.json() is not True:
            raise HTTPException(429,'시도가 너무 많습니다. 15분 후 다시 시도해 주세요.')


async def sign_in(body, response):
    result = await supa('POST','/auth/v1/token?grant_type=password',json={'email':identity(body.username),'password':body.password.get_secret_value()})
    if result.status_code != 200:
        raise HTTPException(429 if result.status_code == 429 else 401,'아이디 또는 비밀번호를 확인해 주세요.')
    data = result.json()
    cookies(response,data)
    return {'user':public_user(data['user'])}


@router.post('/signup')
async def signup(body:Registration, request:Request, response:Response):
    origin_check(request)
    await limit(request,body.username,'signup')
    result = await supa('POST','/auth/v1/admin/users',json={'email':identity(body.username),'password':body.password.get_secret_value(),'email_confirm':True,
        'user_metadata':{'username':body.username,'nickname':body.nickname,'birth_date':body.birth_date.isoformat()}})
    if result.status_code not in (200,201):
        raise HTTPException(409 if result.status_code in (400,422) else 503,'가입할 수 없습니다. 다른 아이디를 사용하거나 잠시 후 다시 시도해 주세요.')
    return await sign_in(body,response)


@router.post('/login')
async def login(body:Credentials,request:Request,response:Response):
    origin_check(request)
    await limit(request,body.username,'login')
    return await sign_in(body,response)


@router.get('/me')
async def me(request:Request,response:Response):
    no_cache(response)
    if not request.cookies.get(ACCESS) and not request.cookies.get(REFRESH):
        return {'user':None,'configured':bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SECRET_KEY'))}
    try:
        user,_ = await session(request,response)
        return {'user':public_user(user),'configured':True}
    except HTTPException as error:
        if error.status_code != 401:
            raise
        clear_cookies(response)
        return {'user':None,'configured':True}


@router.post('/logout')
async def logout(request:Request,response:Response):
    origin_check(request)
    try:
        _,token = await session(request,response)
        result = await supa('POST','/auth/v1/logout?scope=local',token=token)
        if result.status_code not in (200,204,401):
            raise HTTPException(503,'로그아웃을 완료하지 못했어요. 다시 시도해 주세요.')
    except HTTPException as error:
        if error.status_code != 401:
            raise
    clear_cookies(response)
    return {'ok':True}


class PlanProfile(BaseModel):
    beach: str = Field(max_length=40)
    activity: list[str] = Field(min_length=1,max_length=12)
    children: bool = False
    mobility: str = Field(default='any',max_length=30)
    transport: str = Field(default='any',max_length=30)
    budget: str = Field(default='any',max_length=30)
    time_budget: str = Field(default='any',max_length=10)
    mode: str = Field(default='forecast',pattern='^(forecast|demo)$')
    stops: list[str] = Field(default_factory=list,max_length=60)

    @field_validator('beach')
    @classmethod
    def beach_valid(cls,value):
        from .analytics import DESTINATIONS
        if value not in DESTINATIONS: raise ValueError('Unknown beach')
        return value

    @field_validator('activity','stops')
    @classmethod
    def strings_valid(cls,value):
        if any(not x or len(x)>120 for x in value): raise ValueError('Invalid selection')
        return value


class SavePlans(BaseModel):
    expected_user_id: UUID
    profiles: list[PlanProfile] = Field(min_length=1,max_length=100)


@router.get('/plans')
async def plans(request:Request,response:Response):
    user,token = await session(request,response)
    result = await supa('GET','/rest/v1/depart_saved_plans',token=token,params={'select':'id,profile,updated_at','user_id':'eq.'+user['id'],'order':'updated_at.desc','limit':'1000'})
    if result.status_code != 200:
        raise HTTPException(503,'저장한 계획을 불러오지 못했어요.')
    return {'user':public_user(user),'plans':[{'key':r['id'],'profile':r['profile'],'updatedAt':r['updated_at']} for r in result.json()]}


@router.post('/plans')
async def save_plans(body:SavePlans,request:Request,response:Response):
    origin_check(request)
    user,token = await session(request,response)
    if str(body.expected_user_id) != user['id']:
        raise HTTPException(409,'로그인 계정이 바뀌었어요. 새로고침 후 다시 저장해 주세요.')
    rows=[]
    for profile in body.profiles:
        data=profile.model_dump()
        digest=json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':'))
        rows.append({'id':str(uuid5(NAMESPACE_URL,user['id']+digest)),'user_id':user['id'],'profile':data,'updated_at':datetime.now(timezone.utc).isoformat()})
    rows=list({r['id']:r for r in rows}.values())
    result=await supa('POST','/rest/v1/depart_saved_plans',token=token,headers={'Prefer':'resolution=merge-duplicates'},json=rows)
    if result.status_code not in (200,201,204): raise HTTPException(503,'계정에 저장하지 못했어요. 다시 시도해 주세요.')
    return {'saved':len(rows)}


@router.delete('/plans/{plan_id}')
async def delete_plan(plan_id:UUID,request:Request,response:Response,owner:UUID):
    origin_check(request)
    user,token = await session(request,response)
    if str(owner) != user['id']:
        raise HTTPException(409,'로그인 계정이 바뀌었어요. 새로고침 후 다시 시도해 주세요.')
    result = await supa('DELETE','/rest/v1/depart_saved_plans',token=token,params={'id':'eq.'+str(plan_id),'user_id':'eq.'+user['id']})
    if result.status_code not in (200,204): raise HTTPException(503,'삭제하지 못했어요. 다시 시도해 주세요.')
    return {'ok':True}
