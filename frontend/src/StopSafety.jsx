import React, { useState } from 'react';
import './stop-safety.css';

// Guidance is based on the selected place type, never a live inspection of a venue.
export function StopSafety({ row, profile, language }) {
  const [checked, setChecked] = useState({});
  const t = (ko, en) => language === 'en' ? en : ko;
  const coastal = Boolean(row.coastal);
  const port = coastal && profile.beach?.endsWith('port');
  const risks = coastal
    ? [t('너울이 백사장·방파제를 덮칠 수 있어요. 파도가 잔잔해 보여도 물가와 거리를 두세요.', 'Swell can reach beaches and overtop breakwaters. Keep away from the water’s edge even when the sea looks calm.'),
       port ? t('항구 가장자리의 추락·미끄럼에 주의하고, 테트라포드와 작업 구역에는 들어가지 마세요.', 'Watch for falls and slippery harbour edges. Stay off tetrapods and out of working areas.') : t('젖은 바위와 난간 밖은 피하고, 통제선 안으로 들어가지 마세요.', 'Avoid wet rocks, stay behind railings and do not cross closure barriers.')]
    : [row.meal ? t('음식 알레르기가 있다면 주문 전에 재료를 확인하세요.', 'If you have food allergies, confirm ingredients before ordering.') : t('출입구의 계단·젖은 바닥과 비상구 위치를 확인하세요.', 'Check entrance steps, wet floors and emergency exits.'),
       t('주변 도로와 주차장에서는 보행 동선을 먼저 확인하세요.', 'Check pedestrian access around roads and car parks.')];
  const items = coastal ? [
    ['warning', t('출발 직전 특보·너울 예측과 현장 통제 확인', 'Check current warnings, swell forecasts and on-site restrictions before departure')],
    ['gear', t('미끄럼을 줄이는 신발·바람막이·충전된 휴대폰 준비', 'Pack shoes with grip, a windproof layer and a charged phone')],
    ['exit', t('파도가 커지거나 통제 시 물가에서 벗어날 경로 확인', 'Identify a route away from the waterfront if waves rise or access closes')],
  ] : [
    ['hours', row.hours_known ? t('입력한 운영시간·휴게시간을 방문일 기준으로 재확인', 'Reconfirm the entered opening hours and breaks for your visit date') : t('운영시간·휴무·마지막 입장 또는 주문 시간 확인', 'Confirm opening days, hours and last entry or order time')],
    ['access', t('입구·주차 또는 대중교통 하차 위치 확인', 'Check the entrance, parking or public transport stop')],
  ];
  if (coastal && profile.activity?.includes('fishing')) items.push(['fishing', t('낚시는 허용된 지정 장소인지 확인하고 구명조끼 준비', 'For fishing, confirm a permitted designated location and prepare a life jacket')]);
  if (coastal && profile.activity?.includes('swim')) items.push(['swim', t('물놀이 개장·입수 허용·안전요원 배치 확인 — 이 코스는 육상 조망 기준', 'Check swimming opening, permission and lifeguards — this itinerary only plans land-based viewing')]);
  if (profile.children) items.push(['children', t('아이와 함께 이동할 보호자·헤어졌을 때 만날 장소 정하기', 'Agree who will accompany children and where to meet if separated')]);
  if (['stroller', 'step_free'].includes(profile.mobility)) items.push(['accessibility', t('계단 없는 진입로·경사·엘리베이터 운영을 시설에 확인', 'Ask the venue about step-free access, slopes and lift availability')]);
  const count = items.filter(([id]) => checked[id]).length;
  return <details className="stop-safety">
    <summary><span>{t('위험·준비사항', 'Risks & preparation')}</span><small>{count}/{items.length} {t('확인', 'checked')}</small></summary>
    <div className="stop-safety-content">
      <p className="stop-safety-context">{t('장소 유형과 선택 조건에 따른 안내 · 현장 상태 미확인', 'Guidance based on place type and your selections · Site conditions unverified')}</p>
      <h5>{t('이곳에서 주의할 점', 'What to watch for')}</h5>
      {risks.map(risk => <p className="stop-safety-risk" key={risk}>{risk}</p>)}
      <fieldset><legend>{t('출발 전 준비 체크', 'Before you go')}</legend>
        {items.map(([id, label]) => <label key={id}><input type="checkbox" checked={Boolean(checked[id])} onChange={e => setChecked({...checked, [id]:e.target.checked})}/><span>{label}</span></label>)}
      </fieldset>
      {coastal && <div className="stop-safety-links"><a href="https://www.weather.go.kr/w/forecast/ocean/swell.do" target="_blank" rel="noreferrer">{t('기상청 너울 예측 ↗', 'KMA swell forecast ↗')}</a><a href="https://www.kcg.go.kr/donghaecgh/na/ntt/selectNttInfo.do?mi=2685&nttSn=71888" target="_blank" rel="noreferrer">{t('해경 테트라포드 안전 안내 ↗', 'Coast Guard tetrapod guidance ↗')}</a></div>}
      <p className="stop-safety-footnote">{t('체크는 준비 확인용이며 안전을 보장하지 않아요. 이 화면에서만 유지되며 코스 조건·시간이 바뀌면 초기화됩니다.', 'Checks record preparation, not a safety guarantee. They stay on this screen and reset when itinerary conditions or times change.')}</p>
    </div>
  </details>;
}
