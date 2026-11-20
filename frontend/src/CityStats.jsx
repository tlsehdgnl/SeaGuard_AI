import React, { useState } from "react";
import { useLanguage, translate } from "./i18n.js";
import "./citystats.css";

const modes = {forecast:"모델 예보", demo:"시연 예보", all:"전체 예보"};
const labels = {start:"여행 시작 클릭 · 전체 예보",plan_seen:"추천 일정 조회",map_click:"지도 열기",official_click:"장소 안내 열기"};
// Sea-risk signal shown when the plan was viewed. Status colors always ship with an icon + label.
const RISKS = [["낮음","low","●"],["주의","caution","▲"],["위험","danger","◆"]];
const num = n => (n || 0).toLocaleString("ko-KR");
const ratio = (n,total) => total ? n/total : null;
const pct = (n,total) => { const r = ratio(n,total); return r === null ? "—" : (100*r).toFixed(r >= .1 || r === 0 ? 0 : 1)+"%"; };
// Korean subject particle: 받침 있으면 "이", 없으면 "가" (non-Hangul endings fall back to "이(가)").
const ga = w => { const c = (w || "").charCodeAt(w.length - 1) - 0xAC00; return w + (c < 0 || c > 11171 ? "이(가)" : c % 28 ? "이" : "가"); };
const sum = (rows, pick) => rows.reduce((s,r)=>s+pick(r),0);

function exportCsv(d, language) {
  const out=[["시작일(KST)","조회시각(KST)","예보 범위","지표","항목","단위","값"]];
  const add=(metric,item,unit,value,scope=modes[d.mode],from=d.from)=>out.push([from,d.as_of,scope,metric,item,unit,value]);
  Object.entries(labels).forEach(([k,label])=>add("행동 집계",label,"건",d.counts[k]||0,k==="start"?"전체 예보":modes[d.mode]));
  add("조회 후 행동","일정 조회 세션","세션",d.sessions.viewed);
  add("조회 후 행동","조회 후 링크 클릭 세션","세션",d.sessions.clicked);
  for (const [day,v] of Object.entries(d.daily)) for(const [k,n] of Object.entries(v)) add("일별 "+labels[k],day,"건",n);
  for(const [label,n] of d.beaches) add("해변별 일정 조회",label,"건",n);
  for(const [label,n] of d.places) add("관광지별 링크 클릭",label,"건",n);
  for(const [r] of RISKS) add("바다 위험 신호별 일정 조회",r,"건",sum(d.context.filter(c=>c[1]===r),c=>c[3]));
  for(const [h,r,car,n] of d.context) add("출발 조건별 일정 조회",(h < 0 ? "시간 미지정" : h+"시")+" / "+r+" / "+(car < 0 ? "이동수단 미지정" : car?"차량 있음":"차량 없음"),"건",n);
  for(const [day,beach,h,n,c] of d.schedule) {
    const item=day+" / "+beach+" / "+h+"시";
    add("여행 예정일별 계획",item,"건",n); add("여행 예정일별 차량 없는 계획",item,"건",c);
  }
  const csv="﻿"+out.map(row=>row.map(v=>'"'+String(translate(v, language)).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="동해시_관광이용_"+d.from+"_"+d.mode+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Round an axis maximum up to 1/2/5 × 10^k so gridlines land on readable numbers. */
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function Panel({title, note, className = "", children, aside}) {
  return <section className={"cs-panel " + className}>
    <header className="cs-panel-head"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{aside}</header>
    {children}
  </section>;
}

function Kpi({label, value, sub, tone = ""}) {
  return <div className={"cs-kpi " + tone}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

const SERIES = [
  {key:"plan", label:"일정 조회", get:v=>v.plan_seen},
  {key:"click", label:"지역 링크 클릭", get:v=>v.map_click+v.official_click},
];

/** Daily views vs. local-link clicks: two thin lines, crosshair + tooltip on hover/focus, table view below. */
function Trend({days}) {
  const [active, setActive] = useState(null);
  const n = days.length;
  const top = niceMax(Math.max(0, ...days.flatMap(([,v]) => SERIES.map(s => s.get(v)))));
  const x = i => n === 1 ? 50 : (i / (n - 1)) * 100;
  const y = v => 100 - (v / top) * 100;
  const line = s => days.map(([,v],i) => (i ? "L" : "M") + x(i) + "," + y(s.get(v))).join(" ");
  const every = Math.ceil(n / 7);
  const hit = active === null ? null : days[active];
  return <>
    <div className="cs-legend">{SERIES.map(s => <span key={s.key} className={"cs-key cs-" + s.key}>{s.label}</span>)}</div>
    <div className="cs-trend">
      <div className="cs-yaxis" aria-hidden="true">{[top, top/2, 0].map(t => <span key={t}>{num(t)}</span>)}</div>
      <div className="cs-plot" onMouseLeave={() => setActive(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50, 100].map(g => <line key={g} x1="0" x2="100" y1={g} y2={g} className="cs-gridline"/>)}
          <path d={line(SERIES[0]) + ` L${x(n-1)},100 L${x(0)},100 Z`} className="cs-area"/>
          {SERIES.map(s => <path key={s.key} d={line(s)} className={"cs-line cs-" + s.key}/>)}
          {active !== null && <line x1={x(active)} x2={x(active)} y1="0" y2="100" className="cs-cross"/>}
        </svg>
        {days.map(([day,v],i) => SERIES.map(s =>
          <i key={day + s.key} className={"cs-dot cs-" + s.key + (i === active ? " is-on" : "")} style={{left:x(i)+"%", top:y(s.get(v))+"%"}}/>))}
        <div className="cs-hits">{days.map(([day,v],i) =>
          <button key={day} type="button" aria-label={`${day} 일정 조회 ${v.plan_seen}건, 지역 링크 클릭 ${v.map_click+v.official_click}건`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}/>)}</div>
        {hit && <div className="cs-tip" style={{left:`clamp(70px, ${x(active)}%, calc(100% - 70px))`}} role="status">
          <b>{hit[0].slice(5).replace("-", "/")}</b>
          {SERIES.map(s => <span key={s.key} className={"cs-key cs-" + s.key}>{s.label} <em>{num(s.get(hit[1]))}건</em></span>)}
        </div>}
      </div>
    </div>
    <div className="cs-xaxis" aria-hidden="true">{days.map(([day],i) =>
      <span key={day} style={{left:x(i)+"%"}}>{(i % every === 0 || i === n-1) ? day.slice(5).replace("-", "/") : ""}</span>)}</div>
    <details className="cs-details"><summary>일별 수치 표 보기</summary>
      <div className="cs-table-wrap"><table className="cs-table"><thead><tr><th>날짜</th><th>일정 조회</th><th>지도 열기</th><th>장소 안내</th></tr></thead>
        <tbody>{days.map(([day,v]) => <tr key={day}><th>{day}</th><td>{num(v.plan_seen)}</td><td>{num(v.map_click)}</td><td>{num(v.official_click)}</td></tr>)}</tbody></table></div>
    </details>
  </>;
}

function Funnel({start, viewed, clicked}) {
  const steps = [["여행 시작 클릭", start, "건", "전체 예보 기준"], ["일정을 본 세션", viewed, "세션", ""], ["지역 링크까지 연 세션", clicked, "세션", viewed ? "일정 본 세션의 " + pct(clicked, viewed) : ""]];
  const peak = Math.max(1, ...steps.map(s => s[1]));
  return <ol className="cs-funnel">{steps.map(([label, n, unit, note], i) =>
    <li key={label}>
      <div className="cs-funnel-text"><span><b>{i + 1}</b>{label}</span><strong>{num(n)}<small>{unit}</small></strong></div>
      <div className="cs-funnel-track"><i style={{width: Math.max(n ? 3 : 0, 100 * n / peak) + "%"}}/></div>
      {note && <small>{note}</small>}
    </li>)}</ol>;
}

function RiskMix({context}) {
  const rows = RISKS.map(([r, cls, icon]) => [r, cls, icon, sum(context.filter(c => c[1] === r), c => c[3])]);
  const total = sum(rows, r => r[3]);
  if (!total) return <p className="cs-empty">계획 요약을 조회하면 바다 위험 신호별 분포가 표시됩니다.</p>;
  return <>
    <div className="cs-stack" role="img" aria-label={rows.map(([r,,,n]) => `${r} ${pct(n,total)}`).join(", ")}>
      {rows.filter(r => r[3]).map(([r, cls,, n]) => <i key={r} className={"cs-risk-" + cls} style={{flexGrow:n}} title={`${r} ${num(n)}건`}/>)}
    </div>
    <ul className="cs-risk-list">{rows.map(([r, cls, icon, n]) =>
      <li key={r} className={"cs-risk-" + cls}><span><i aria-hidden="true">{icon}</i>{r}</span><b>{pct(n,total)}</b><small>{num(n)}건</small></li>)}</ul>
  </>;
}

function ShareBar({n, total}) {
  const r = ratio(n, total) || 0;
  return <span className="cs-share"><i style={{width: (100*r) + "%"}}/><em>{pct(n, total)}</em></span>;
}

function BeachTable({beaches, schedule, views}) {
  if (!beaches.length) return <p className="cs-empty">선택한 기간에 해변별 일정 조회 기록이 없습니다.</p>;
  const planned = {};
  for (const [, b,, n, c] of schedule) { planned[b] ??= [0, 0]; planned[b][0] += n; planned[b][1] += c; }
  return <div className="cs-table-wrap"><table className="cs-table">
    <thead><tr><th>순위</th><th>해변</th><th>일정 조회</th><th className="cs-wide">점유율</th><th>예정일 등록</th><th>차량 없음</th></tr></thead>
    <tbody>{beaches.slice(0, 10).map(([name, n], i) => { const [p, c] = planned[name] || [0, 0];
      return <tr key={name}><td><span className={"cs-rank" + (i < 3 ? " is-top" : "")}>{i + 1}</span></td><th>{name}</th><td>{num(n)}</td>
        <td className="cs-wide"><ShareBar n={n} total={views}/></td><td>{p ? num(p) + "건" : "—"}</td><td>{p ? pct(c, p) : "—"}</td></tr>; })}
    </tbody></table></div>;
}

/** Planned visits for the coming days (beach × date), a sequential single-hue heat table. */
function Upcoming({schedule, today}) {
  const rows = schedule.filter(([day]) => day >= today);
  const dates = [...new Set(rows.map(r => r[0]))].sort().slice(0, 7);
  if (!dates.length) return <p className="cs-empty">오늘 이후 여행 예정일이 등록된 계획이 아직 없습니다.</p>;
  const cell = {}, totals = {};
  for (const [day, b,, n] of rows) if (dates.includes(day)) { cell[b + day] = (cell[b + day] || 0) + n; totals[b] = (totals[b] || 0) + n; }
  const beaches = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const peak = Math.max(1, ...Object.values(cell));
  const week = ["일","월","화","수","목","금","토"];
  return <div className="cs-table-wrap"><table className="cs-table cs-heat">
    <thead><tr><th>해변</th>{dates.map(d => <th key={d}>{d.slice(5).replace("-", "/")}<small>{week[new Date(d + "T00:00:00Z").getUTCDay()]}</small></th>)}<th>합계</th></tr></thead>
    <tbody>{beaches.map(b => <tr key={b}><th>{b}</th>{dates.map(d => { const n = cell[b + d] || 0, t = n / peak;
      return <td key={d} style={n ? {"--heat": Math.round(12 + 70 * t) + "%"} : undefined} className={n ? (t > .55 ? "is-hot" : "is-warm") : ""}>{n || "·"}</td>; })}
      <td><b>{num(totals[b])}</b></td></tr>)}</tbody></table></div>;
}

function PlaceTable({places}) {
  if (!places.length) return <p className="cs-empty">추천 관광지의 지도·안내 링크 클릭 기록이 없습니다.</p>;
  const total = sum(places, p => p[1]);
  return <div className="cs-table-wrap"><table className="cs-table">
    <thead><tr><th>순위</th><th>관광지</th><th>링크 클릭</th><th className="cs-wide">비중</th></tr></thead>
    <tbody>{places.slice(0, 10).map(([name, n], i) => <tr key={name}><td><span className={"cs-rank" + (i < 3 ? " is-top" : "")}>{i + 1}</span></td><th>{name}</th><td>{num(n)}</td><td className="cs-wide"><ShareBar n={n} total={total}/></td></tr>)}</tbody>
  </table></div>;
}

const AI_ERRORS = {
  disabled: "AI 키가 서버에 설정되지 않았어요. OPENAI_API_KEY를 등록하면 사용할 수 있어요.",
  no_data: "요약할 이용 기록이 아직 없어요.",
  limited: "AI 요청이 잠시 몰렸어요. 1분 뒤 다시 시도해 주세요.",
};
const TONES = {good:["좋아요","✓"], watch:["지켜보기","◐"], act:["조치 필요","!"]};

/** On-demand AI briefing of the current period. Generated from the same aggregates shown below. */
function AiBrief({ai}) {
  const [state, setState] = useState({status:"idle"});
  const scope = ai ? ai.days + ai.mode : "";
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== lastScope) { setLastScope(scope); setState({status:"idle"}); }
  if (!ai) return null;
  async function run() {
    setState({status:"loading"});
    try {
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "") + "/api/admin/ai-brief", {method:"POST", cache:"no-store",
        headers:{"Content-Type":"application/json", Authorization:"Bearer " + ai.token}, body:JSON.stringify({days:ai.days, mode:ai.mode})});
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(AI_ERRORS[body.detail] || "AI 요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState({status:"done", brief:body});
    } catch (e) { setState({status:"error", message:e.message}); }
  }
  const {status, brief} = state;
  return <section className={"cs-ai is-" + status} aria-labelledby="cs-ai-title" aria-busy={status === "loading"}>
    <header className="cs-ai-head">
      <div><p className="cs-ai-eyebrow"><span aria-hidden="true">✦</span> AI 운영 브리핑</p>
        <h2 id="cs-ai-title">{brief ? brief.headline : "이번 기간 데이터를 AI가 읽고 요약해 드려요"}</h2></div>
      <button type="button" className="cs-ai-btn" onClick={run} disabled={status === "loading"}>
        {status === "loading" ? "분석 중…" : brief ? "다시 요약" : "AI 요약 만들기"}</button>
    </header>
    {status === "idle" && <p className="cs-ai-hint">아래 지표(해변 수요, 위험 신호, 방문 예정, 교통)를 묶어 담당자가 바로 쓸 수 있는 요약과 조치 제안을 만들어요.</p>}
    {status === "loading" && <div className="cs-ai-skeleton" aria-hidden="true"><i/><i/><i/></div>}
    {status === "error" && <p className="cs-ai-error" role="alert">{state.message}</p>}
    {brief && status === "done" && <div className="cs-ai-body">
      <ul className="cs-ai-points">{brief.points.map((p, i) => <li key={i} className={"tone-" + p.tone}>
        <span className="cs-ai-tag"><i aria-hidden="true">{TONES[p.tone][1]}</i>{TONES[p.tone][0]}</span>{p.text}</li>)}</ul>
      {brief.actions.length > 0 && <div className="cs-ai-actions"><h3>추천 조치</h3>
        <ol>{brief.actions.map((a, i) => <li key={i}>{a}</li>)}</ol></div>}
    </div>}
    <p className="cs-ai-foot">AI가 작성한 요약이에요. 수치는 아래 표에서 확인하고, 위험 신호는 공식 특보가 아닌 서비스 예보 기준이에요.{brief?.cached ? " · 5분 안의 같은 요청은 저장된 결과를 보여 줘요." : ""}</p>
  </section>;
}

export default function CityStats({data:d, ai}) {
  const {language} = useLanguage();
  const views = d.counts.plan_seen || 0, {viewed, clicked} = d.sessions;
  const days = Object.entries(d.daily);
  const today = d.as_of.slice(0, 10);
  const contextTotal = sum(d.context, r => r[3]);
  const risky = sum(d.context.filter(r => r[1] !== "낮음"), r => r[3]);
  const transportTotal = sum(d.context, r => r[2] < 0 ? 0 : r[3]);
  const noCar = sum(d.context, r => r[2] === 0 ? r[3] : 0);
  const top = d.beaches[0], topPlace = d.places[0];
  const upcoming = d.schedule.filter(r => r[0] >= today);
  const busiest = Object.entries(upcoming.reduce((m, [day, b,, n]) => ({...m, [day + " " + b]: (m[day + " " + b] || 0) + n}), {})).sort((a, b) => b[1] - a[1])[0];

  const insights = [
    top && ["🏖️", `${ga(top[0])} 일정 조회의 ${pct(top[1], views)}로 가장 많이 계획됐어요.`],
    contextTotal && risky && ["⚠️", `주의·위험 신호 속에서 본 계획이 ${pct(risky, contextTotal)}예요. 해당 해변의 현장 안전 안내를 점검해 주세요.`],
    busiest && ["📅", `${busiest[0].slice(5, 10).replace("-", "/")} ${busiest[0].slice(11)} 방문 예정이 ${num(busiest[1])}건으로 가장 몰려 있어요.`],
    transportTotal && noCar && ["🚌", `차량 없는 일정이 ${pct(noCar, transportTotal)}예요. 해변까지 대중교통 연계 안내가 필요해요.`],
    viewed && ["🔗", `일정을 본 세션의 ${pct(clicked, viewed)}가 지역 관광지 링크까지 열었어요.`],
  ].filter(Boolean).slice(0, 4);

  return <div className="cs">
    <div className="cs-range"><span className="cs-chip">{d.from.replaceAll("-", ".")} – {today.replaceAll("-", ".")}</span><span className="cs-chip is-soft">{modes[d.mode]}</span><span className="cs-asof">{d.as_of.slice(11, 16)} 기준 · 한국시간</span>
      <button type="button" className="cs-btn" onClick={() => exportCsv(d, language)}>CSV 내려받기 ↓</button></div>

    <div className="cs-kpis">
      <Kpi label="여행 시작" value={num(d.counts.start)} sub="첫 화면에서 시작한 횟수"/>
      <Kpi label="추천 일정 조회" value={num(views)} sub={`익명 세션 ${num(viewed)}개`} tone="is-primary"/>
      <Kpi label="지역 관광 연계율" value={pct(clicked, viewed)} sub="일정 조회 → 지도·장소 링크"/>
      <Kpi label="주의·위험 속 계획" value={pct(risky, contextTotal)} sub={contextTotal ? `${num(risky)} / ${num(contextTotal)}건` : "기록 없음"} tone={risky ? "is-alert" : ""}/>
      <Kpi label="차량 없는 일정" value={pct(noCar, transportTotal)} sub="이동수단 선택 기록 기준"/>
    </div>

    <AiBrief ai={ai}/>

    {insights.length > 0 && <section className="cs-insights" aria-label="이번 기간 핵심 요약">
      <h2>이번 기간 한눈에 보기 <small>자동 집계</small></h2>
      <ul>{insights.map(([icon, text]) => <li key={text}><span aria-hidden="true">{icon}</span>{text}</li>)}</ul>
    </section>}

    <Panel title="일별 이용 추이" note="서비스를 이용한 날짜 기준 · 점에 마우스를 올리면 수치가 보여요." className="cs-span">
      <Trend days={days}/>
    </Panel>

    <div className="cs-grid">
      <Panel title="이용 흐름" note="여행 시작부터 지역 관광지 링크를 열기까지">
        <Funnel start={d.counts.start || 0} viewed={viewed} clicked={clicked}/>
      </Panel>
      <Panel title="바다 위험 신호별 계획" note="일정을 볼 때 서비스가 안내한 해양·기상 신호">
        <RiskMix context={d.context}/>
      </Panel>
    </div>

    <Panel title="해변별 수요" note="일정에 선택한 출발 해변 기준 · 차량 없음은 여행 예정일이 있는 계획 기준" className="cs-span">
      <BeachTable beaches={d.beaches} schedule={d.schedule} views={views}/>
    </Panel>

    <Panel title="다가오는 방문 예정" note="오늘 이후 여행 예정일 기준 해변별 계획 수 · 색이 진할수록 많아요. 안전요원·교통 배치 참고용" className="cs-span">
      <Upcoming schedule={d.schedule} today={today}/>
    </Panel>

    <Panel title="관광지 관심 순위" note={topPlace ? `${ga(topPlace[0])} 가장 많이 열렸어요 · 지도·안내 링크 클릭 상위 10곳` : "추천 관광지의 지도·안내 링크 클릭 상위 10곳"} className="cs-span">
      <PlaceTable places={d.places}/>
    </Panel>
  </div>;
}


export function StatsUnavailable({loading}) {
  const {language} = useLanguage();
  const en = language === 'en';
  const status = loading ? (en ? 'Loading statistics…' : '통계를 불러오는 중입니다…') : (en ? 'Data unavailable · check the statistics database connection.' : '조회 불가 · 통계 저장소 연결을 확인해 주세요.');
  const metrics = ['여행 시작', '추천 일정 조회', '지역 관광 연계율', '주의·위험 속 계획', '차량 없는 일정'];
  const panels = ['일별 이용 추이', '이용 흐름', '바다 위험 신호별 계획', '해변별 수요', '다가오는 방문 예정', '관광지 관심 순위'];
  return <div className="cs stats-unavailable" aria-busy={loading}>
    <div className="cs-range"><p role="status" className="cs-asof">{status}</p><button className="cs-btn" disabled>{en ? 'Export CSV ↓' : 'CSV 내려받기 ↓'}</button></div>
    <div className="cs-kpis">{metrics.map(title=><div className={"cs-kpi" + (loading ? " is-loading" : "")} key={title}><span>{title}</span><strong>—</strong><small>{en ? 'Awaiting data' : '데이터 확인 필요'}</small></div>)}</div>
    <div className="cs-grid">{panels.map(title=><section className={"cs-panel" + (loading ? " is-loading" : "")} key={title}><header className="cs-panel-head"><div><h2>{title}</h2><p>{status}</p></div></header><div className="cs-skeleton" aria-hidden="true"/></section>)}</div>
  </div>;
}
