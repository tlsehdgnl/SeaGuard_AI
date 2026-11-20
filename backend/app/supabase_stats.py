import os
import httpx
from fastapi import HTTPException

def enabled():
    return bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SECRET_KEY') and not os.getenv('TRAIL_DATABASE_URL'))

def call(path,body):
    try:
        response=httpx.post(os.environ['SUPABASE_URL'].rstrip('/')+'/rest/v1/'+path,headers={'apikey':os.environ['SUPABASE_SECRET_KEY'],'Prefer':'resolution=ignore-duplicates'},json=body,timeout=15)
        if response.status_code not in (200,201,204): raise HTTPException(503,'통계 저장소 연결을 확인해 주세요.')
        return response.json() if response.content else None
    except httpx.HTTPError:
        raise HTTPException(503,'통계 저장소 연결을 확인해 주세요.') from None
