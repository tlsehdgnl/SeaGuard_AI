"""Read-only browsing of source-backed Donghae catalog, not a live opening/safety claim."""
from fastapi import APIRouter, Query, HTTPException
from typing import Literal
from .accounts import supa
router=APIRouter(prefix='/api/catalog')

@router.get('')
async def catalog(q:str=Query('',max_length=60),kind:Literal['food','cafe','bar','lodging','attractions','facilities']='food',offset:int=Query(0,ge=0,le=10000)):
    params={'select':'id,kind,name,address,latitude,longitude,checked_at,payload','kind':'eq.'+kind,'order':'name.asc,id.asc','limit':'20','offset':str(offset),'recommend_state':'neq.hold'}
    clean=''.join(c for c in q if c.isalnum() or c.isspace()).strip()
    if clean: params['name']='ilike.*'+clean+'*'
    result=await supa('GET','/rest/v1/depart_catalog',params=params,headers={'Prefer':'count=exact'})
    if result.status_code not in (200,206): raise HTTPException(503,'지역 자료를 불러오지 못했어요.')
    rows=[]
    for row in result.json():
        data=row.pop('payload')
        row['hours']=data.get('hours') or data.get('운영시간·휴관일')
        row['source']=data.get('source_url') or data.get('source') or data.get('운영정보 공식 URL')
        row['ratings']=[{k:r.get(k) for k in ('platform','rating','scale','reviews','observed_at','url')} for r in data.get('ratings',[]) if r.get('rating') is not None]
        row['notes']=data.get('notes') or data.get('어린이 동반 참고사항')
        rows.append(row)
    total=result.headers.get('content-range','').split('/')[-1]
    return {'items':rows,'total':int(total) if total.isdigit() else len(rows),'offset':offset,'source_version':'2026-11-20'}
