import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import DayPreview from './DayPreview';
import courses from './previewCourses.json';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const BEACHES = [
  { id: 'mangsang', name: '망상', point: [175, 48] },
  { id: 'chuam', name: '추암', point: [256, 169] },
  { id: 'eodal', name: '어달', point: [202, 89] },
];
const SPECIAL_REPORT = 'https://www.weather.go.kr/w/special-report/overall.do';
const SWELL_REPORT = 'https://www.weather.go.kr/w/forecast/ocean/swell.do';
const REQUEST_TIMEOUT_MS = 30000;
const dateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const clock = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit',
});

async function requestForecast(beach, mode, signal) {
  const response = await fetch(`${BASE}/api/risk/${beach}?mode=${mode}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result?.beach?.id !== beach || result?.meta?.mode !== mode ||
      result.meta.is_demo !== (mode === 'demo') || !result.values || !result.risk) {
    throw new Error('Unexpected forecast response');
  }
  return result;
}

function formatTime(value, formatter = dateTime) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? formatter.format(date) : '시각 정보 없음';
}

function Icon({ name, size = 20, ...props }) {
  const paths = {
    wave: <><path d="M2 9c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2S13 7 15.2 7s2.2 2 4.4 2c1.2 0 1.6-.6 2.4-1.2M2 15c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2c1.2 0 1.6-.6 2.4-1.2"/></>,
    arrow: <path d="M6 18 18 6M8 6h10v10"/>,
    refresh: <path d="M20 11a8 8 0 1 0-2 6.3M20 5v6h-6"/>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    wind: <path d="M3 8h12a2 2 0 1 0-2-2M3 12h16a2 2 0 1 1-2 2M3 16h8a2 2 0 1 1-2 2"/>,
    rain: <path d="M12 3c2.8 4.2 5.5 7.3 5.5 10.4a5.5 5.5 0 0 1-11 0C6.5 10.3 9.2 7.2 12 3Z"/>,
    temperature: <path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0ZM12 11v6"/>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></>,
    location: <><path d="M19 10c0 5.5-7 10-7 10S5 15.5 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}

function ExternalLink({ href, children, className }) {
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="arrow" size={15}/><span className="sr-only"> (새 탭)</span></a>;
}

function CoastMap({ selected }) {
  return <figure className="coast-map" aria-label="동해시 해변 위치 개략도">
    <svg viewBox="0 0 440 210" aria-hidden="true">
      <defs><pattern id="chart-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#77969d" strokeWidth=".7" opacity=".38"/></pattern></defs>
      <rect width="440" height="210" fill="#e0edf0"/>
      <rect width="440" height="210" fill="url(#chart-grid)"/>
      <path d="M0 0H143l6 13 11 9 5 9-1 9 11 8 9 12 8 14-1 6 11 9 8 8 2 10 12 6 3 9 13 7 4 10 12 3 9 9-1 8-8 10 5 11 10 2 8 15 12 12H0Z" fill="#f1f1e6" stroke="#7a989a" strokeWidth="1.2"/>
      <g stroke="#8da9ac" strokeWidth="1" fill="none" opacity=".62"><path d="M197 0c20 33 24 64 53 85s27 43 43 66 31 26 47 59"/><path d="M230 0c23 33 29 60 52 76s28 44 43 61 33 42 52 73"/><path d="M267 0c22 26 26 50 44 66s31 37 46 60 26 42 52 84"/></g>
      <text x="25" y="127" className="map-area">동해시</text>
      <text x="365" y="114" className="map-sea">동 해</text>
      <g transform="translate(402 34)" className="map-north"><text x="0" y="-7" textAnchor="middle">N</text><path d="M0 0-4 11 0 9l4 2Z" fill="currentColor"/></g>
      {[...BEACHES].sort((a, b) => a.point[1] - b.point[1]).map(({ id, name, point: [x, y] }) => <g key={id} transform={`translate(${x} ${y})`} className={selected === id ? 'map-point active' : 'map-point'}>
        <circle className="map-halo" r="11"/><circle className="map-pin" r={selected === id ? 5 : 3.5}/><text x="-13" y="4" textAnchor="end">{name}</text>
      </g>)}
    </svg>
    <figcaption><span><Icon name="location" size={14}/> 동해시 해변 개략도</span><span>위치 참고용</span></figcaption>
  </figure>;
}

const ADVICE = {
  demo: { tone: 'demo', label: '시연용 데이터', title: '현재 해변 상태가 아닙니다', text: '고정된 가상 시나리오입니다. 방문 전에는 모델 예보와 현장 안내를 확인하세요.' },
  loading: { tone: 'neutral', label: '불러오는 중', title: '현장 통제 여부를 먼저 확인하세요', text: '모델 예보를 불러오는 동안 아래에서 기상청 특보와 너울 예측을 확인할 수 있어요.' },
  error: { tone: 'neutral', label: '정보 확인 필요', title: '예보를 확인하지 못했어요', text: '다시 시도하거나 공식 정보를 확인하세요. 예보가 없다고 안전한 것은 아닙니다.' },
  low: { tone: 'neutral', label: '모델 예보 참고', title: '현장 통제 여부를 먼저 확인하세요', text: '파도와 바람이 약하게 예보돼도 입수 가능 여부는 알 수 없어요. 현장 안내를 따르세요.' },
  caution: { tone: 'caution', label: '예보에 주의 신호', title: '물놀이를 자제하세요', text: '파도·바람 등에 주의가 필요한 신호가 있어요. 방문 전 기상청 특보와 현장 통제를 확인하세요.' },
  danger: { tone: 'danger', label: '예보에 강한 주의 신호', title: '물가와 거리를 두세요', text: '입수를 피하고 안전한 곳에서 확인하세요. 기상청 특보와 현장 통제 안내를 우선하세요.' },
};

function ActionPanel({ name, mode, status, data }) {
  const advice = mode === 'demo' ? ADVICE.demo : ADVICE[status === 'ready' ? data.risk.level : status] || ADVICE.error;
  return <section className={`action-panel ${advice.tone}`} aria-labelledby="action-title">
    <div className="action-body" aria-live="polite" aria-atomic="true">
      <div className="action-kicker"><span className="action-place">{name}해변 방문 전</span><span className="action-label">{advice.label}</span></div>
      <h2 id="action-title">{advice.title}</h2>
      <p>{advice.text}</p>
    </div>
    <div className="official-links" id="official" role="group" aria-label="기상청 공식 정보">
      <span className="official-caption">기상청 공식 정보</span>
      <ExternalLink href={SPECIAL_REPORT}>기상특보</ExternalLink>
      <ExternalLink href={SWELL_REPORT}>너울 예측</ExternalLink>
    </div>
  </section>;
}

const METRICS = [
  { key: 'wave_height', name: '파고', unit: 'm', icon: 'wave' },
  { key: 'wind_speed', name: '풍속', unit: 'm/s', icon: 'wind' },
  { key: 'precipitation', name: '강수량', unit: 'mm', icon: 'rain' },
  { key: 'temperature', name: '기온', unit: '°C', icon: 'temperature' },
];

function Measurements({ mode, status, data, onRefresh }) {
  const interval = data?.meta?.precipitation_interval_seconds;
  const intervalLabel = Number.isFinite(interval) && interval > 0 ? ` (${interval / 60}분)` : '';
  return <section className="measurements" aria-labelledby="measurements-title" aria-busy={status === 'loading'}>
    <div className="measurements-header">
      <div><h2 id="measurements-title">{mode === 'demo' ? '시연 수치' : '파도·바람 예보'}</h2><p>{mode === 'demo' ? '가상 값 · 오늘의 예보 아님' : '해변 인근 모델 예보 · 현장 관측 아님'}</p></div>
      <button type="button" className="icon-button" aria-label="예보 새로고침" disabled={status === 'loading'} onClick={onRefresh}><Icon name="refresh" size={19}/></button>
    </div>
    <dl className="metric-grid">
      {METRICS.map(({ key, name, unit, icon }) => {
        const value = data?.values[key];
        const hasValue = Number.isFinite(value);
        return <div key={key} className="metric">
          <dt><Icon name={icon} size={16}/>{name}{key === 'precipitation' ? intervalLabel : ''}</dt>
          <dd className={hasValue ? '' : 'unavailable'}>{hasValue ? <>{value.toFixed(1)} <small>{unit}</small></> : <><span aria-hidden="true">–</span><span className="sr-only">{status === 'loading' ? '불러오는 중' : '정보 없음'}</span></>}</dd>
        </div>;
      })}
    </dl>
    <div className="measurements-note">
      {status === 'ready' && (mode === 'demo' ? <>고정 시나리오 · {data.risk.label} 신호</> : <><span>기상 {formatTime(data.meta?.data_times?.weather, clock)}</span><span aria-hidden="true">·</span><span>해양 {formatTime(data.meta?.data_times?.marine, clock)} (한국시간)</span></>)}
      {status === 'loading' && <span>데이터를 불러오는 중입니다.</span>}
      {status === 'error' && <button type="button" className="text-button" onClick={onRefresh}><Icon name="refresh" size={15}/> 다시 시도</button>}
    </div>
  </section>;
}

function Details({ data }) {
  const meta = data?.meta;
  const explanation = data?.explanation;
  return <section className="reading" id="guide" aria-label="예보를 읽는 방법">
    <details>
      <summary><span>데이터 출처와 조회 시각</span><Icon name="chevron" size={19}/></summary>
      <div className="details-copy">
        {meta ? <><dl className="source-grid">
          <div><dt>데이터 출처</dt><dd>{meta.source}</dd></div>
          <div><dt>조회 시각 (한국시간)</dt><dd>{formatTime(meta.retrieved_at)}</dd></div>
          <div><dt>기상 데이터 시각 (한국시간)</dt><dd>{meta.is_demo ? '고정 예시' : formatTime(meta.data_times?.weather)}</dd></div>
          <div><dt>해양 데이터 시각 (한국시간)</dt><dd>{meta.is_demo ? '고정 예시' : formatTime(meta.data_times?.marine)}</dd></div>
        </dl><div className="source-links">{meta.source_urls?.map(url => <ExternalLink key={url} href={url}>{url.includes('marine') ? '해양 예보 출처' : '기상 예보 출처'}</ExternalLink>)}</div></>
          : <p>예보를 가져오면 데이터 출처와 시각을 표시합니다.</p>}
      </div>
    </details>
    <details>
      <summary><span>주의 신호의 기준과 한계</span><Icon name="chevron" size={19}/></summary>
      <div className="details-copy">
        <p>파고·풍속·강수량을 서비스의 시연용 기준과 비교합니다. 기상청 특보나 해변의 공식 입수 통제 기준이 아닙니다. 이안류·낙뢰·수심·조석·현장 통제는 반영하지 않습니다.</p>
        {data?.risk?.reasons?.length > 0 && <ul>{data.risk.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <p>시연용 기준: 파고 1m / 2m, 풍속 6m/s / 10m/s, 강수량 3mm / 7mm부터 각각 주의 / 강한 주의 신호를 표시합니다. 강수량은 수치에 표시된 집계 구간을 함께 확인하세요.</p>
        {explanation?.supplement && <blockquote><strong>AI 보충 설명</strong><p>{explanation.supplement}</p></blockquote>}
        {explanation?.notice && <small>{explanation.notice}</small>}
      </div>
    </details>
  </section>;
}

function App() {
  const [beach, setBeach] = useState('mangsang');
  const [mode, setMode] = useState('forecast');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${beach}:${mode}:${refresh}`;
  const current = result?.key === key ? result : null;
  const status = current?.status || 'loading';
  const data = current?.data || null;
  const selected = BEACHES.find(item => item.id === beach);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    requestForecast(beach, mode, controller.signal)
      .then(data => { if (active && !controller.signal.aborted) setResult({ key, status: 'ready', data }); })
      .catch(() => { if (active) setResult({ key, status: 'error' }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [beach, mode, key]);

  const reload = () => setRefresh(value => value + 1);
  return <>
    <a className="skip-link" href="#content">본문으로 건너뛰기</a>
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label="SeaGuard AI 처음으로"><span className="brand-mark"><Icon name="wave" size={22}/></span><span>SeaGuard AI</span></a>
        <a className="header-link" href="#official">공식 정보 확인 <Icon name="chevron" size={14}/></a>
      </div>
    </header>
    <main id="content" className="shell">
      <section className="intro" aria-labelledby="intro-title">
        <div><p className="intro-tag"><Icon name="location" size={17}/>강원특별자치도 동해시</p><h1 id="intro-title">동해 해변 방문 안내</h1><p className="intro-copy">망상·추암·어달의 파도와 바람 예보,<br className="desktop-break"/> 방문 전 확인할 안전 정보를 한곳에서 보세요.</p></div>
        <CoastMap selected={beach}/>
      </section>
      <section className="forecast" aria-label="해변 선택 및 예보">
        <div className="selection" role="group" aria-label="확인할 해변">
          {BEACHES.map(item => <button type="button" key={item.id} aria-pressed={beach === item.id} onClick={() => setBeach(item.id)}>{item.name}해변</button>)}
        </div>
        <div className="forecast-meta">
          <span className={mode === 'demo' ? 'mode-label demo-mode' : 'mode-label'}>{mode === 'demo' ? '시연용 데이터 · 현재 상태 아님' : 'Open-Meteo 모델 예보'}</span>
          <button type="button" className="mode-switch" onClick={() => setMode(mode === 'forecast' ? 'demo' : 'forecast')}>{mode === 'forecast' ? '시연 예시 보기' : '모델 예보로 돌아가기'}</button>
        </div>
        <div className="forecast-grid">
          <ActionPanel name={selected.name} mode={mode} status={status} data={data}/>
          <Measurements mode={mode} status={status} data={data} onRefresh={reload}/>
        </div>
      </section>
      <div className="disclaimer"><Icon name="alert" size={17}/><p>해변 인근 격자 예보이며 공식 경보나 입수 허가가 아닙니다. <strong>현장 안내와 통제를 우선하세요.</strong></p></div>
      <DayPreview key={beach} beach={selected.name} stops={courses[beach]}/>
      <Details data={data}/>
    </main>
    <footer className="site-footer"><div className="shell footer-inner"><span>SeaGuard AI <span aria-hidden="true">·</span> 동해 해변 방문 안내</span><a href="#guide">데이터와 안내 기준</a></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
