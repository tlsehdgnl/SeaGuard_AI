import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from './i18n.js';
import coordinates from './routeCoordinates.json';
import dataset from './shelters.json';
import { nearestShelters } from './shelters.js';
import './shelters.css';

export function ShelterFinder({name, compact=false, placePoint}) {
  const {language}=useLanguage();
  const t=(ko,en)=>language==='en'?en:ko;
  const [location,setLocation]=useState(null);
  const [state,setState]=useState('');
  const request=useRef(0);
  useEffect(()=>()=>{request.current+=1;},[]);
  const point=location?.point || placePoint || coordinates[name];
  const nearby=nearestShelters(point,dataset.items);
  function locate() {
    if (!navigator.geolocation) {setState('unavailable');return;}
    const version=++request.current;
    setLocation(null);
    setState('loading');
    navigator.geolocation.getCurrentPosition(position=>{
      if(version!==request.current)return;
      setLocation({point:[position.coords.latitude,position.coords.longitude],accuracy:Math.round(position.coords.accuracy)});setState('');
    },error=>{if(version===request.current)setState(error.code===1?'denied':'unavailable');}, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }
  const body=<>
    <p className="shelter-origin">{location?t('현재 위치','Current location'):name} · {t('직선거리 기준','Straight-line distance')}{location && ` · ±${location.accuracy} m`}</p>
    {!compact && <div className="shelter-actions"><button type="button" disabled={state==='loading'} onClick={locate}>{state==='loading'?t('위치 확인 중…','Locating…'):t('내 위치로 찾기','Use my location')}</button>{location && <button type="button" onClick={()=>{request.current+=1;setLocation(null);setState('');}}>{t('선택한 장소 기준으로','Use selected place')}</button>}</div>}
    {state && state!=='loading' && <p role="status">{state==='denied'?t('위치 권한이 없어 선택한 장소 기준을 유지합니다.','Location access denied. Showing the selected place.'):t('현재 위치를 확인하지 못했어요. 선택한 장소 기준으로 확인하세요.','Location unavailable. Use the selected place instead.')}</p>}
    {nearby.length ? <div className="shelter-results">{nearby.slice(0,compact?1:3).map((s,i)=><article className="shelter-result" key={s.id}>
      <div className="shelter-result-title"><strong lang="ko">{i+1}. {s.name}</strong><span>{(Math.round(s.distance/10)*10).toLocaleString()} m</span></div>
      <p lang="ko">{s.address}</p>
      <a href={'https://www.google.com/maps/dir/?api=1&destination='+s.point.join(',')+'&travelmode=walking'} target="_blank" rel="noreferrer">{t('도보 길찾기 ↗','Walking directions ↗')}</a>
    </article>)}</div>:<p role="status">{t('이 위치 주변의 등록 자료가 없거나 장소 좌표를 확인할 수 없어요. 공식 대피시설 지도에서 확인하세요.','No nearby records or place coordinates available. Check the official evacuation map.')}</p>}
    <p className="shelter-note">{t('동해시 등록 28곳 중 가까운 순서입니다. 실제 도보거리·이동시간·통제·수용 가능 여부는 반영하지 않습니다. 인접 시·군의 장소는 포함하지 않습니다.','Closest among 28 registered Donghae locations. Walking distance, travel time, restrictions and availability are not assessed. Neighbouring cities are not included.')}</p>
    <p className="shelter-alert">{t('지진해일 발생 시 현장 대피 표지와 재난 안내를 우선하세요. 일반 지도 길찾기는 공식 대피 경로가 아닙니다.','During a tsunami, follow evacuation signs and official instructions. General map directions are not verified evacuation routes.')}</p>
    <a href={dataset.source_url} target="_blank" rel="noreferrer">{t('국민재난안전포털 대피시설 지도 ↗','Official evacuation facilities map ↗')}</a>
    <p className="shelter-note">{t('지진해일 전용 대피장소 · 공식 자료 확인','Tsunami evacuation places · Official data retrieved')} {dataset.retrieved_at.slice(0,10)}{!compact && t(' · 현재 위치는 서버에 전송·저장하지 않습니다.',' · Your location is not sent to or stored on our server.')}</p>
  </>;
  return compact?<details className="shelter-finder compact"><summary>{t('가까운 지진해일 대피장소','Nearby tsunami evacuation place')}</summary>{body}</details>:<details className="shelter-finder"><summary>{t('가까운 지진해일 대피장소','Nearby tsunami evacuation places')}</summary>{body}</details>;
}
