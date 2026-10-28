import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const BASE = import.meta.env.VITE_API_BASE_URL || '';
async function request(path, signal) {
  const r = await fetch(BASE + path, { signal });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.detail?.message || `서버 요청 실패 (${r.status})`);
  if (!data) throw new Error('서버 응답을 읽을 수 없습니다.');
  return data;
}
const formatTime = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST' : '없음 · 고정 예시';
function App() {
  const [beaches, setBeaches] = useState([]), [beach, setBeach] = useState('mangsang');
  const [mode, setMode] = useState('demo'), [data, setData] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    setData(null); setError(''); setLoading(true);
    Promise.all([request('/api/beaches', controller.signal), request(`/api/risk/${beach}?mode=${mode}`, controller.signal)])
      .then(([list, result]) => { if (!controller.signal.aborted) { setBeaches(list); setData(result); } })
      .catch(e => { if (active) setError(e.name === 'AbortError' ? '응답 시간이 초과되었습니다. 다시 시도하세요.' : e.message); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [beach, mode, refresh]);
  // Retain beach selection even when initial API calls fail.
  const options = beaches.length ? beaches : [{id:'mangsang',name:'망상'}, {id:'chuam',name:'추암'}, {id:'eodal',name:'어달'}];
  return <>
    <header><a className="brand" href="/">≈ <span>SeaGuard <b>AI</b></span></a><span className="location">동해시 해변 인사이트 <span className="dot">●</span> MVP</span></header>
    <main>
      <section className="intro"><div><p className="eyebrow">BEFORE YOU MEET THE SEA</p><h1>바다에 가기 전,<br/>한 번 더 확인하세요.</h1><p className="sub">동해의 세 해변, 기상 정보로 살펴보는 위험 신호.<br/>데이터의 근거와 한계를 함께 보여드립니다.</p></div><div className="sea" aria-hidden="true"><div className="sun"/><div className="wave w1"/><div className="wave w2"/><div className="wave w3"/><span>37° N · EAST SEA</span></div></section>
      <section className="controls" aria-label="분석 설정"><div className="tabs">{options.map(b => <button key={b.id} aria-pressed={beach === b.id} className={beach === b.id ? 'selected' : ''} onClick={() => setBeach(b.id)}>{b.name} 해변</button>)}</div><label>데이터 모드 <select value={mode} onChange={e=>setMode(e.target.value)}><option value="demo">예시 데이터</option><option value="forecast">외부 모델 예보</option></select></label><button className="refresh" onClick={()=>setRefresh(x=>x+1)}>↻ 새로고침</button></section>
      <div className={`notice ${mode === 'demo' ? 'demo' : ''}`} role="note"><strong>{mode === 'demo' ? 'DEMO · 실제 관측값이 아닙니다' : 'MODEL · 관측값이 아닌 격자 예보입니다'}</strong><span>{mode === 'demo' ? '기능 시연을 위한 고정 시나리오입니다. 오늘의 해변 상태로 해석하지 마세요.' : '해변 인근 모델 값을 사용합니다. 국지적 파도·이안류나 현장 통제를 판단할 수 없습니다.'}</span></div>
      {error ? <section className="error" role="alert"><h2>정보를 불러오지 못했습니다</h2><p>{error}</p><button onClick={()=>setRefresh(x=>x+1)}>다시 시도</button>{mode !== 'demo' && <button onClick={()=>setMode('demo')}>예시 모드로 전환</button>}</section> : loading ? <section className="loading" role="status">기상 정보와 위험 신호를 확인하고 있습니다…</section> : data && <>
        <div className="dashboard"><section className={`risk card ${data.risk.level}`}><p className="eyebrow">RISK OVERVIEW · {data.beach.name} 해변</p><div className="riskTitle"><h2>{data.risk.label}</h2><span className="riskIcon">{data.risk.level === 'low' ? '≈' : '!'}</span></div><p>규칙 기반 위험 신호 <b>· {data.meta.is_demo ? '예시 분석' : '예보 분석'}</b></p><ul>{data.risk.reasons.map(r=><li key={r}>{r}</li>)}</ul><div className="riskFoot">낮음도 입수 안전을 의미하지 않습니다.</div></section>
        <section className="metrics"><Metric label="파고" value={data.values.wave_height} unit="m" symbol="≈"/><Metric label="풍속" value={data.values.wind_speed} unit="m/s" symbol="↗"/><Metric label="강수량" value={data.values.precipitation} unit="mm" symbol="◌" subtitle={data.meta.is_demo ? '예시 값 · 집계 구간 없음' : `${data.meta.precipitation_interval_seconds / 60}분 구간`}/><Metric label="기온" value={data.values.temperature} unit="°C" symbol="☼" subtitle="등급 산정에서 제외"/></section></div>
        <section className="explain card"><div><p className="eyebrow">WHY THIS LEVEL?</p><h2>위험 신호를 읽는 방법</h2></div><div><span className="badge">{data.explanation.source === 'rules' ? '규칙 기반 설명' : '규칙 + AI 보충'}</span><p>{data.explanation.text}</p>{data.explanation.supplement && <blockquote><strong>AI 보충 설명</strong><p>{data.explanation.supplement}</p></blockquote>}{data.explanation.notice && <small>{data.explanation.notice}</small>}</div></section>
        <section className="provenance card"><h2>데이터의 출처와 시각</h2><dl><div><dt>데이터 출처</dt><dd>{data.meta.source}</dd></div><div><dt>기상 데이터 시각</dt><dd>{formatTime(data.meta.data_times.weather)}</dd></div><div><dt>해양 데이터 시각</dt><dd>{formatTime(data.meta.data_times.marine)}</dd></div><div><dt>응답 생성 / 조회 시각</dt><dd>{formatTime(data.meta.retrieved_at)}</dd></div></dl>{data.meta.source_urls.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{url.includes('marine') ? '해양 API 출처 ↗' : '기상 API 출처 ↗'}</a>)}</section>
      </>}
      <details className="rules"><summary>위험도 계산 기준과 서비스 한계</summary><p>가장 높은 항목의 등급을 적용합니다. 파고: 주의 ≥ 1m / 위험 ≥ 2m, 풍속: 주의 ≥ 6m/s / 위험 ≥ 10m/s, 강수량: 주의 ≥ 3mm / 위험 ≥ 7mm. 강수량은 제공 구간별 값이며 예보 모드에 구간 길이를 표시합니다.</p><p>이 임계값은 MVP 시연용이며 공식 기준이나 검증된 안전 모델이 아닙니다. 기온은 표시만 합니다. 이안류·낙뢰·조석·수심·현장 통제 정보는 포함하지 않습니다. 공식 특보와 안전요원의 지시를 우선하세요.</p></details>
      <footer><span>SeaGuard AI · 동해시 MVP</span><span>공식 경보 또는 입수 허가 서비스가 아닙니다.</span></footer>
    </main>
  </>;
}
function Metric({label,value,unit,symbol,subtitle}) { return <article className="card metric"><div><span>{label}</span><span aria-hidden="true">{symbol}</span></div><p>{value.toFixed(1)} <small>{unit}</small></p><small>{subtitle || '분석에 사용된 입력값'}</small></article> }
createRoot(document.getElementById('root')).render(<App/>);
