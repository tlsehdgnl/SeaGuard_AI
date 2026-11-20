import { ShelterFinder } from "./ShelterFinder.jsx";
import { StopSafety } from "./StopSafety.jsx";
import { CourseMap } from "./CourseMap.jsx";
import { MapLink } from "./MapLink.jsx";
import { useLanguage } from "./i18n.js";
import coordinates from "./routeCoordinates.json";
import React, { useState, useEffect, useRef } from "react";
import { activities, beachRegion, regions, shops, shopCategory } from "./nearby.js";

export function CoursePlanner({ indoorPlaces, loading, profile, start, weather, activityNames, conditions, forecastText, visitDate, setVisitDate, onAlternate, replaceStop }) {
  const { language } = useLanguage();
  const settingsKey = "departner.course." + profile.beach + "." + profile.time_budget + "." + location.hash;
  const [saved] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(settingsKey)); } catch { return null; }
  });
  const [settings, setSettings] = useState(saved?.settings || { closed:false, start:"10:00", end:"18:00", meals:profile.time_budget === "any" || Number(profile.time_budget) >= 180 ? ["12:00"] : [], hours:{}});
  const generation = useRef(0);
  const [applied, setApplied] = useState(saved?.applied || settings);
  useEffect(()=>{try {sessionStorage.setItem(settingsKey,JSON.stringify({settings,applied}));} catch {}},[settingsKey,settings,applied]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatDialog = useRef(null);
  const chatBottom = useRef(null);
  useEffect(() => {
    if (!chatOpen) return;
    const dialog = chatDialog.current;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, [chatOpen]);
  useEffect(() => {
    if (chatOpen) chatBottom.current?.scrollIntoView({block:"nearest"});
  }, [messages, sending, chatError, chatOpen]);
  const [responseData, setResult] = useState(null);
  const [attempt, retry] = useState(0);
  const [error, setError] = useState("");
  const region = beachRegion[profile.beach];
  const required = new Set(profile.stops);
  const places = Object.entries(shops).flatMap(([key, rows]) => rows.map(([name, kind, address]) => ({
    name, detail: [regions[key], kind, address].join(" · "), required: required.has(name), meal:shopCategory(kind) === "식당",
  })));
  places.push(...indoorPlaces.map(place => ({name:place.name, detail:[place.address,...place.checks].join(" · ").slice(0,190), required:true})));
  const selected = profile.stops.map(name => places.find(place => place.name === name)).filter(Boolean);
  for (const place of profile.catalog || []) {
    if (selected.some(stop => stop.name === place.name)) continue;
    required.add(place.name);
    selected.push({name:place.name, detail:"동해 장소 자료", required:true, meal:place.kind === "food",
      point:Number.isFinite(place.latitude) && Number.isFinite(place.longitude) ? [place.latitude, place.longitude] : undefined});
  }
  const wishes = profile.activity;
  const wanted = [];
  for (const [activity, category] of [["food", "식당"], ["cafe", "카페·간식"]]) {
    if (!wishes.includes(activity) && !(activity === "food" && applied.meals.length)) continue;
    const rows = shops[region].filter(([,kind]) => shopCategory(kind) === category);
    const count = activity === "food" ? Math.max(0, applied.meals.length - selected.filter(s=>s.meal).length) : 1;
    wanted.push(...rows.filter(([name]) => !required.has(name)).slice(0, count));
  }
  const optional = (profile.budget === "free" ? [] : wanted)
    .map(([name,kind,address]) => ({ name, detail: kind+" · "+address, meal:shopCategory(kind) === "식당" }));
  if (!selected.length && !optional.length && profile.budget !== "free") {
    const [name, kind, address] = shops[region].find(([,kind]) => shopCategory(kind) === "카페·간식");
    optional.push({ name, detail: kind+" · "+address, meal:shopCategory(kind) === "식당" });
  }
  const candidates = [{name:start, detail:"바다 조망 · 현장 통제와 공식 특보 확인 후 방문", required:true, coastal:true}, ...selected, ...optional.filter(place => !required.has(place.name))];
  const minutes = profile.time_budget === "any" ? Infinity : Number(profile.time_budget);
  const payload = candidates.length && !loading ? JSON.stringify({
    beach_id:profile.beach, visit_date:visitDate, mode:profile.mode, coastal_closed:applied.closed,
    start, activities: activityNames, conditions, weather: forecastText, origin: coordinates[start],
    candidates: candidates.map(stop => ({ ...stop, point: stop.point || coordinates[stop.name], duration:stop.meal ? 60 : minutes <= 30 && stop.coastal ? 15 : 40, windows:parseHours(applied.hours[stop.name]) })),
    start_minute:toMinutes(applied.start), end_minute:Math.min(toMinutes(applied.end), toMinutes(applied.start)+(Number.isFinite(minutes) ? minutes : 1440)),
    meal_times:applied.meals.map(toMinutes), transport:profile.transport === "car" ? "car" : profile.transport === "transit" ? "transit" : "walk", language,
    extras: Math.min(optional.length, Math.max(0, Math.floor(minutes / 30) - selected.length)),
  }) : "";
  const result = responseData?.payload === payload ? responseData : null;
  useEffect(() => {
    generation.current += 1;
    setSending(false);
    if (!payload) return;
    const controller = new AbortController();
    const places = JSON.parse(payload).candidates;
    setResult(null);
    setMessages([]);
    setChatError("");
    setError("");
    async function generate() {
      try {
        const res = await fetch((import.meta.env.VITE_API_BASE_URL || "")+"/api/course", {
          method:"POST", headers:{"Content-Type":"application/json"}, body:payload, signal:controller.signal,
        });
        if (!res.ok) throw Error();
        const response = await res.json();
        if (!controller.signal.aborted) setResult({...response, payload, stops:response.order.map(i => places[i])});
      } catch {
        if (!controller.signal.aborted) setError("코스를 불러오지 못했어요.");
      }
    }
    generate();
    return () => { generation.current += 1; controller.abort(); };
  }, [payload, attempt]);
  async function send(event) {
    event.preventDefault();
    if (!message.trim() || sending || !result) return;
    const next = [...messages, {role:"user", content:message.trim()}].slice(-15);
    const version = generation.current;
    setSending(true); setChatError("");
    try {
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || "")+"/api/course/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({course:JSON.parse(payload), messages:next, current_order:result.order}), signal:AbortSignal.timeout(55000),
      });
      const data = await res.json();
      if (version !== generation.current) return;
      if (!res.ok) throw Error(data.detail === "disabled" ? "disabled" : data.detail === "limited" ? "limited" : "failed");
      const places = JSON.parse(payload).candidates;
      setResult({...data, payload, stops:data.order.map(i=>places[i])});
      setMessages([...next,{role:"assistant",content:data.reply}]); setMessage("");
    } catch (err) {
      if (version !== generation.current) return;
      setChatError(err.message === "disabled" ? "서버에 OPENAI_API_KEY를 설정하면 GPT와 대화할 수 있어요." : err.message === "limited" ? "요청이 많아요. 잠시 후 다시 보내 주세요." : "GPT 연결에 실패했어요. 서버의 키·모델·API 사용 한도를 확인하고 다시 시도해 주세요.");
    } finally { if (version === generation.current) setSending(false); }
  }
  function apply(event) {
    event.preventDefault();
    const end = Math.min(toMinutes(settings.end), toMinutes(settings.start)+(Number.isFinite(minutes) ? minutes : 1440));
    if (end <= toMinutes(settings.start) || settings.meals.some(t=>toMinutes(t)<toMinutes(settings.start) || toMinutes(t)>=end) || new Set(settings.meals).size !== settings.meals.length) {
      setError("식사 시간은 여행 시간과 선택한 시간 제한 안에서 서로 다르게 지정해 주세요."); return;
    }
    try { Object.values(settings.hours).forEach(parseHours); }
    catch { setError("운영시간 형식을 확인해 주세요. 예: 09:00-14:00,17:00-20:00 또는 휴무"); return; }
    setApplied(settings); retry(n=>n+1);
  }
  return <section className="course-planner">
    <div className="course-main">
    <div className="course-title"><h3>바다와 함께하는 하루</h3><p>이동 계산 기준 지역 · {start}</p></div>
    <form className="course-settings" onSubmit={apply}>
      <fieldset disabled={sending}><legend>바다 시간에 맞추는 일정</legend>
        <label>방문 날짜<input type="date" min={tripDate(0)} max={tripDate(6)} required value={visitDate} onChange={e=>{if(e.target.value>=tripDate(0) && e.target.value<=tripDate(6)) setVisitDate(e.target.value);}}/></label>
        <label>출발 시간<input type="time" required value={settings.start} onChange={e=>setSettings({...settings,start:e.target.value})}/></label>
        <label>종료 시간<input type="time" required value={settings.end} onChange={e=>setSettings({...settings,end:e.target.value})}/></label>
        <label>식사 횟수<select value={settings.meals.length} onChange={e=>setSettings({...settings,meals:["12:00","17:00","10:00"].slice(0,Number(e.target.value))})}>{[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        {settings.meals.map((time,i)=><label key={i}>식사 시간 {i+1}<input type="time" required value={time} onChange={e=>setSettings({...settings,meals:settings.meals.map((t,j)=>j===i?e.target.value:t)})}/></label>)}
        <details><summary>가게별 운영시간 입력</summary>
          <p className="hint">방문일의 운영시간을 지도에서 확인해 입력하세요. 비워두면 미확인, 휴무는 제외됩니다. 휴게시간은 구간을 나누어 입력하세요. 예: 09:00-14:00,17:00-20:00</p>
          {candidates.filter(stop=>!stop.coastal).map(stop=><label key={stop.name}>{stop.name}<input aria-label={stop.name+" 운영시간"} placeholder="09:00-14:00,17:00-20:00" value={settings.hours[stop.name]||""} onChange={e=>setSettings({...settings,hours:{...settings.hours,[stop.name]:e.target.value}})}/><a href={"https://map.naver.com/p/search/"+encodeURIComponent(stop.name)} target="_blank" rel="noreferrer">운영시간 확인 ↗</a></label>)}
        </details>
        <label className="coastal-closure"><input type="checkbox" checked={settings.closed} onChange={e=>setSettings({...settings,closed:e.target.checked})}/>현장 출입 통제·공식 특보를 확인했어요 (바다 방문 제외)</label>
        <button type="submit">조건 적용 · 코스 다시 만들기</button>
      </fieldset>
    </form>
    {!!selected.length && <p>동선에 담은 곳 · {selected.map(s=>s.name).join(" → ")}</p>}
    {(!result && !error && (loading || payload)) && <p role="status">방문 순서를 정하고 있어요…</p>}
    {!loading && !candidates.length && <p>주변 활동에서 들르고 싶은 곳을 동선에 추가해 주세요.</p>}
    {error && <p role="alert">{error} <button onClick={() => retry(n => n+1)}>다시 조회</button></p>}
    {result?.sea_plan && <SeaPlan plan={result.sea_plan} language={language} />}
    {result && <div aria-live="polite"><h4>{result.source === "ai" ? "AI 추천 방문 순서" : "거리 기반 방문 순서"} · 방문 {result.stops.length}곳</h4>
      {result.source === "basic" && <p className="hint">AI 응답을 사용할 수 없어 위치를 기준으로 방문 순서를 계산했어요.</p>}
      <p className="hint">이동시간은 직선거리 기반 추정치이며 실제 도로·교통·대중교통 시간표를 반영하지 않습니다. 이동수단 미선택 시 도보로 계산합니다.</p>
      <ol className="course-timeline">{result.timeline.map(row=>{const stop=JSON.parse(payload).candidates[row.id]; return <li key={row.id} data-place-name={stop.name} className={row.meal ? "is-meal" : undefined}>
        <span className="tl-time">{clock(row.arrival)}–{clock(row.departure)}</span>
        <div className="tl-body">
          <div className="tl-head"><strong>{stop.name}</strong><span className="tl-kind">{row.coastal ? "바다 조망" : row.meal ? "식사" : "방문"}</span>
            <MapLink href={"https://map.naver.com/p/search/"+encodeURIComponent("동해시 "+stop.name)} name={stop.name} /></div>
          <p>{stop.detail}</p><p className="tl-meta">예상 이동 {row.travel_minutes} min · {row.distance_km === null ? "좌표 미확인" : `${row.distance_km} km`} · {row.coastal ? "시간별 예보 반영 · 현장 확인 필요" : row.hours_known ? "입력한 운영시간 반영" : "운영시간 확인 필요"}</p>
          <ShelterFinder key={stop.name} name={stop.name} placePoint={stop.point} compact />
          <StopSafety key={payload+JSON.stringify(row)} row={row} profile={profile} language={language} />
        </div>
      </li>})}</ol>
      {!result.timeline.length && minutes <= 30 && <p role="status">짧은 조망은 15분이며 이동시간도 필요해요. 방문 시간을 바꾸거나 가까운 장소를 선택해 주세요.</p>}
      {result.skipped.map(i=>{
        const missed = JSON.parse(payload).candidates[i];
        const alternatives = places.filter(p=>p.name!==missed.name && !selected.some(s=>s.name===p.name) &&
          (!missed.meal || p.meal) && !candidates.some(s=>s.name===p.name));
        if (!alternatives.length) return null;
        return <label key={i} className="field">{missed.name} 대신 방문할 곳
          <select value="" onChange={e=>{if(e.target.value) replaceStop(missed.name,e.target.value);}}>
            <option value="">대체 장소 선택</option>
            {alternatives.map(p=><option key={p.name}>{p.name}</option>)}
          </select>
        </label>;
      })}
      {(result.missing_meals > 0 || result.skipped.length > 0) && <button type="button" onClick={onAlternate}>다른 식당·장소 선택하기</button>}
      {!!result.missing_meals && <p role="status">배치하지 못한 식사: {result.missing_meals} · 식사 시간, 식당 또는 여행 시간을 조정해 주세요.</p>}
      {!!result.skipped.length && <p>일정에 넣지 못한 장소: {result.skipped.map(i=>JSON.parse(payload).candidates[i].name).join(", ")} · 시간·식사 횟수·운영시간 조건을 확인해 주세요.</p>}
    </div>}
    </div>
    <aside className="course-side">
      <button className="chat-link chat-cta" disabled={!result} onClick={()=>setChatOpen(true)} aria-haspopup="dialog">
        <span className="chat-cta-icon" aria-hidden="true">✦</span>
        <span className="chat-cta-text"><strong>이 계획으로 AI와 대화하기</strong>
          <small>{result ? "동선·식사 시간을 AI와 함께 다듬어요" : "코스를 만드는 중이에요…"}</small></span>
        <span className="chat-cta-arrow" aria-hidden="true">→</span>
      </button>
      {!!result?.stops.length && <div className="course-map-card"><CourseMap stops={result.stops} />
        <p className="hint">이동시간과 영업 여부는 각 장소의 지도에서 확인하세요.</p></div>}
    </aside>
    {chatOpen && <dialog ref={chatDialog} className="trip-chat-dialog" aria-labelledby="trip-chat-title" onCancel={()=>setChatOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setChatOpen(false);}}>
      <div className="trip-chat-shell">
        <header className="trip-chat-header">
          <img className="trip-chat-avatar" src="/departner-mark.svg" alt=""/>
          <div><p className="trip-chat-eyebrow">DEPARTNER</p><h2 id="trip-chat-title">나의 여행 메이트</h2><p>현재 계획을 함께 다듬어요</p></div>
          <button type="button" className="trip-chat-close" aria-label="대화창 닫기" onClick={()=>setChatOpen(false)}>×</button>
        </header>
        <div className="trip-chat-context"><span>함께 보는 여행 계획</span><strong>{start}</strong><small>{applied.start} – {applied.end} · 식사 {applied.meals.length}<span>회</span></small></div>
        <div className="trip-chat-messages" role="log" aria-label="여행 대화" aria-live="polite">
          <div className="trip-chat-row assistant"><img className="trip-chat-avatar" src="/departner-mark.svg" alt=""/><div className="trip-chat-bubble"><strong>DePartner</strong><p>어떤 여행을 원하시나요? 지금 계획을 바탕으로 이동 동선과 방문 순서를 함께 다듬어 드릴게요.</p></div></div>
          {!messages.length && <div className="trip-chat-prompts">{["이동 거리를 줄이고 싶어요", "이 코스의 식사 시간을 검토해 줘", "아이와 함께 가기 좋은 동선일까?"].map(text=><button type="button" key={text} disabled={sending} onClick={()=>setMessage(language === "en" ? ({"이동 거리를 줄이고 싶어요":"I'd like to reduce travel distance.","이 코스의 식사 시간을 검토해 줘":"Please review the meal times in this itinerary.","아이와 함께 가기 좋은 동선일까?":"Is this route suitable for a trip with children?"}[text]) : text)}>{text} ↗</button>)}</div>}
          {messages.map((m,i)=><div key={i} className={"trip-chat-row "+m.role}><div className="trip-chat-bubble"><strong>{m.role === "user" ? "대화 사용자" : "DePartner"}</strong><p>{m.content}</p></div></div>)}
          {sending && <><div className="trip-chat-row user"><div className="trip-chat-bubble"><strong>대화 사용자</strong><p>{message}</p></div></div><div className="trip-chat-row assistant"><div className="trip-chat-bubble trip-chat-pending" role="status">답변을 기다리고 있어요…</div></div></>}
          {chatError && <p className="trip-chat-error" role="alert">{chatError}</p>}
          <div ref={chatBottom}/>
        </div>
        <form className="trip-chat-composer" onSubmit={send}>
          <label className="trip-chat-input-label" htmlFor="trip-chat-input">GPT에게 요청</label>
          <div className="trip-chat-input-row"><textarea id="trip-chat-input" maxLength={2000} required disabled={sending} value={message} onChange={e=>setMessage(e.target.value)} placeholder="어떤 여행을 원하시는지 이야기해 주세요" onKeyDown={e=>{if(e.key==="Enter" && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form.requestSubmit();}}}/><button className="trip-chat-send" disabled={sending || !message.trim() || !result} aria-label="보내기">↑</button></div>
          <p className="trip-chat-note">Enter로 전송 · Shift+Enter로 줄바꿈</p>
          <details className="trip-chat-disclosure"><summary>대화 및 일정 안내</summary><p>현재 코스와 대화 내용이 OpenAI로 전송됩니다. 대화로 방문 순서를 조정할 수 있으며 시간·식사 횟수는 위 조건에서 변경하세요. 대화와 상세 일정 조건은 이 화면에서만 유지됩니다.</p></details>
        </form>
      </div>
    </dialog>}

  </section>;
}

function toMinutes(value) { const [h,m]=value.split(":").map(Number); return h*60+m; }
function clock(value) { return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`; }
function parseHours(value) {
  if (!value?.trim()) return null;
  if (["휴무","closed"].includes(value.trim().toLowerCase())) return [];
  const intervals=value.split(",").map(part=>{
    if (!/^\s*([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d\s*$/.test(part)) throw Error("hours");
    const [a,b]=part.trim().split("-").map(toMinutes); if(a>=b) throw Error("hours"); return [a,b];
  });
  if(intervals.length>4) throw Error("hours"); return intervals;
}

export function tripDate(offset) {
  const now=new Date(); now.setDate(now.getDate()+offset);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function SeaPlan({plan,language}) {
  const status={scheduled:"바다를 만날 시간을 찾았어요",closed:"현장 통제에 따라 바다 방문을 제외했어요",no_window:"이 시간에는 바다 방문을 추천하기 어려워요",conflict:"식사·이동 조건에 맞는 바다 시간이 없어요",unavailable:"예보를 확인하지 못해 바다 방문을 보류했어요"};
  const en={scheduled:"Your sea-viewing time is ready",closed:"Sea visit removed due to reported restrictions",no_window:"No viewing window meets our planning criteria",conflict:"No sea-viewing slot fits this itinerary",unavailable:"Sea visit on hold: forecast unavailable"};
  return <section className={"sea-plan "+plan.status} aria-label="바다 방문 시간 분석">
    <p className="sea-plan-eyebrow">DEPARTNER · SEA TIME</p>
    <h3>{language==='en'?en[plan.status]:status[plan.status]}</h3>
    <p>{plan.date} · {plan.is_demo ? "시연용 가상 예보" : "시간별 모델 예보"}</p>
    {plan.selected && <><strong className="sea-plan-time">{clock(plan.selected.arrival ?? plan.selected.minute)} – {clock(plan.selected.departure ?? plan.selected.minute+40)}</strong><p>파고 {plan.selected.wave} m · 바람 {plan.selected.wind} m/s · 강수 {plan.selected.rain} mm/h</p><p>선택한 식사·방문 장소와 이동시간을 고려해, 예보가 상대적으로 잔잔한 시간에 바다 조망을 배치했어요.</p></>}
    {!plan.selected && <p>바다 방문을 제외하고 선택한 가게와 실내 활동을 배치했어요. 방문 날짜나 시간을 바꾸거나 공식 정보를 확인해 주세요.</p>}
    {!!plan.alternatives?.length && <p>다른 방문 후보 시간 · {plan.alternatives.map(p=>clock(p.minute)).join(' / ')}</p>}
    <div className="sea-plan-hours" aria-label="시간별 바다 예보">{plan.points?.filter(p=>p.minute>=360&&p.minute<=1140).map(p=><div key={p.minute} className={p.minute===plan.selected?.minute?'chosen':''}><strong>{clock(p.minute)}</strong><span>{p.wave} m</span><span>{p.wind} m/s</span></div>)}</div>
    <details><summary>시간을 고른 기준과 한계</summary><p>육지에서 바다를 보는 일정에 한해, 일출 30분 후부터 일몰 30분 전의 시간대를 비교합니다. 파고 1.5m·풍속 8m/s·시간당 강수 1mm 이상 또는 뇌우 예보는 후보에서 제외합니다. 이는 서비스 내부의 보수적인 일정 기준이며 공식 안전 기준이 아닙니다. 물놀이·낚시·갯바위 접근 가능 여부를 판단하지 않습니다.</p><p>조회 시각 · {plan.retrieved_at ? new Date(plan.retrieved_at).toLocaleString(language==='en'?'en-US':'ko-KR') : '확인 불가'}</p></details>
    <p className="sea-plan-notice">예보가 잔잔해도 안전을 보장하지 않습니다. 공식 특보·현장 통제를 우선하고, 통제가 있으면 바다 방문을 제외하세요.</p>
    <a href="https://www.weather.go.kr/w/special-report/overall.do" target="_blank" rel="noreferrer">기상청 공식 특보 확인 ↗</a>
  </section>;
}
