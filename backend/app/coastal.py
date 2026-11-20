"""Explainable sea-view planning, never a safety clearance or swimming forecast."""
import asyncio
import math
import time
from datetime import date, datetime, timedelta, timezone

import httpx

KST = timezone(timedelta(hours=9))
_cache = {}


def parse_day(weather, marine, visit_date):
    for feed, fields in ((weather, {'wind_speed_10m':'m/s','precipitation':'mm','weather_code':'wmo code'}), (marine, {'wave_height':'m'})):
        if feed.get('utc_offset_seconds') != 32400:
            raise ValueError('Wrong timezone')
        if any(feed['hourly_units'].get(k) != unit for k,unit in fields.items()):
            raise ValueError('Wrong units')
    daily = weather['daily']; day_index = daily['time'].index(visit_date)
    sunrise = datetime.fromisoformat(daily['sunrise'][day_index])
    sunset = datetime.fromisoformat(daily['sunset'][day_index])
    wave_by_time = dict(zip(marine['hourly']['time'], marine['hourly']['wave_height']))
    points=[]
    for i,stamp in enumerate(weather['hourly']['time']):
        if not stamp.startswith(visit_date): continue
        values={k:weather['hourly'][k][i] for k in ('wind_speed_10m','precipitation','weather_code')}
        values['wave_height']=wave_by_time.get(stamp)
        if any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in values.values()): continue
        if values['wave_height']>30 or values['wind_speed_10m']>100 or values['precipitation']>500: continue
        dt=datetime.fromisoformat(stamp)
        points.append({'minute':dt.hour*60+dt.minute, 'wave':values['wave_height'], 'wind':values['wind_speed_10m'], 'rain':values['precipitation'], 'thunder':values['weather_code']>=95,
                       'daylight':sunrise+timedelta(minutes=30)<=dt and dt+timedelta(hours=1)<=sunset-timedelta(minutes=30)})
    if not points: raise ValueError('No valid forecast')
    return points


async def day_forecast(beach, visit_date, mode):
    if mode == 'demo':
        return {'points':[{'minute':h*60,'wave':0.7 if h>=14 else 1.8,'wind':3 if h>=14 else 9,'rain':0,'thunder':False,'daylight':8<=h<=16} for h in range(24)],
                'retrieved_at':datetime.now(KST).isoformat(),'source':'DePartner synthetic demo','is_demo':True}
    key=(beach['id'],visit_date)
    if key in _cache and time.monotonic()-_cache[key][0]<600: return _cache[key][1]
    params={'latitude':beach['latitude'],'longitude':beach['longitude'],'timezone':'Asia/Seoul','start_date':visit_date,'end_date':visit_date}
    async with httpx.AsyncClient(timeout=12) as client:
        w,m=await asyncio.gather(
            client.get('https://api.open-meteo.com/v1/forecast',params={**params,'hourly':'wind_speed_10m,precipitation,weather_code','daily':'sunrise,sunset','wind_speed_unit':'ms'}),
            client.get('https://marine-api.open-meteo.com/v1/marine',params={**params,'hourly':'wave_height'}))
    w.raise_for_status();m.raise_for_status()
    result={'points':parse_day(w.json(),m.json(),visit_date),'retrieved_at':datetime.now(KST).isoformat(),'source':'Open-Meteo weather & marine model forecast','is_demo':False}
    if len(_cache)>=100: _cache.pop(next(iter(_cache)))
    _cache[key]=(time.monotonic(),result)
    return result


def viewing_slots(points, start, end, duration=40, now_minute=0):
    """Internal conservative ranking for land-based viewing, not official thresholds."""
    result=[]
    for p in points:
        minute=p['minute']
        if minute<max(start,now_minute) or minute+duration>end or not p['daylight']: continue
        if p['wave']>=1.5 or p['wind']>=8 or p['rain']>=1 or p['thunder']: continue
        result.append({**p,'score':round(p['wave']*3+p['wind']*.3+p['rain']*2,2)})
    return sorted(result,key=lambda p:(p['score'],p['minute']))
