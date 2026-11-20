import React, { useEffect, useState } from "react";
import "./account.css";
import "./admin.css";
import IntegrationDashboard from "./IntegrationDashboard.jsx";
import CityStats, { StatsUnavailable } from "./CityStats";
import { LanguageSwitch, useLanguage } from "./i18n.js";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export default function Admin() {
  const {language} = useLanguage();
  const [tab, setTab] = useState("stats");
  const [input, setInput] = useState("");
  const [key, setKey] = useState("");
  const [mode, setMode] = useState("forecast");
  const [days, setDays] = useState(7);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setError(""); setData(null);
    async function load() {
      try {
        const res = await fetch(base + "/api/admin/stats?days=" + days + "&mode=" + mode, {
          headers: { Authorization: "Bearer " + key }, signal: controller.signal, cache: "no-store"
        });
        if (controller.signal.aborted) return;
        if (res.status === 401) { setKey(""); throw new Error("관리자 접속키를 확인하세요."); }
        if (res.status === 503) throw new Error("운영 서버의 통계 저장소 연결을 확인해 주세요. 관리자 키 인증 후 데이터베이스 설정이 필요합니다.");
        if (!res.ok) throw new Error("통계를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
        const result = await res.json();
        if (!controller.signal.aborted) setData(result);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    }
    load();
    return () => controller.abort();
  }, [key, days, mode, refresh]);

  const en = language === "en";
  if (!key) return <main className="admin-gate">
    <div className="account-nav"><a href="/">← {en ? "Back to DePartner" : "뒤로가기"}</a><LanguageSwitch/></div>
    <a href="/?home" className="account-brand"><img src="/departner-mark.svg" alt=""/>DePartner</a>
    <section className="account-card admin-gate-card">
      <span className="admin-gate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>
      </span>
      <p className="account-eyebrow">DONGHAE OPERATIONS</p>
      <h1>동해시 관광 운영 통계</h1>
      <p>{en ? "Visitor flows, popular beaches and API status for city staff. Enter the administrator key to continue."
        : "방문 흐름, 인기 해변, API 연결 상태를 한눈에 확인하는 담당자용 화면이에요. 관리자 접속키를 입력해 주세요."}</p>
      <form onSubmit={e => {e.preventDefault(); setError(""); setTab("stats"); setKey(input.trim()); setInput(""); setReveal(false);}}>
        <label>관리자 접속키
          <span className="admin-key-field">
            <input type={reveal ? "text" : "password"} required autoComplete="current-password" spellCheck={false}
              placeholder={en ? "Administrator key" : "접속키 입력"} value={input} onChange={e => setInput(e.target.value)}
              aria-invalid={!!error} aria-describedby={error ? "admin-gate-error" : undefined}/>
            <button type="button" className="admin-key-toggle" aria-pressed={reveal} onClick={() => setReveal(!reveal)}>
              {reveal ? (en ? "Hide" : "숨기기") : (en ? "Show" : "보기")}</button>
          </span>
        </label>
        <button className="account-primary admin-gate-submit" disabled={!input.trim()}>통계 열기 <span aria-hidden="true">→</span></button>
      </form>
      {error && <p id="admin-gate-error" className="account-error" role="alert">{error}</p>}
      <p className="admin-gate-note">{en ? "The key is kept only while this tab is open and is never saved in the browser."
        : "접속키는 이 탭을 열어 둔 동안에만 쓰이고 브라우저에 저장되지 않아요."}</p>
    </section>
  </main>;

  return <main className="adminView">
    <div className="account-nav"><a href="/">← {en ? "Back to DePartner" : "뒤로가기"}</a><LanguageSwitch/></div>
    <header className="admin-header">
      <a href="/?home" className="account-brand"><img src="/departner-mark.svg" alt=""/>DePartner</a>
      <p className="account-eyebrow">DONGHAE OPERATIONS</p>
      <h1>동해시 관광 운영 통계</h1>
    </header>
    <>
      <nav className="admin-sections" aria-label={language === "en" ? "Admin sections" : "관리자 메뉴"}>
        <button type="button" aria-pressed={tab === "stats"} onClick={()=>setTab("stats")}>{language === "en" ? "Operating statistics" : "운영 통계"}</button>
        <button type="button" aria-pressed={tab === "api"} onClick={()=>setTab("api")}>{language === "en" ? "API connections" : "API 연결 상태"}</button>
        <button type="button" className="admin-signout" onClick={()=>{setKey("");setData(null);setError("");setTab("stats");}}>로그아웃</button>
      </nav>
      {tab === "stats" ? <section aria-label={language === "en" ? "Operating statistics" : "운영 통계"}>
      <div className="adminTools"><label>집계 기간 <select value={days} onChange={e => setDays(Number(e.target.value))}>
        {[1,7,30].map(n => <option key={n} value={n}>최근 {n}일</option>)}</select></label>
        <label>예보 범위 <select value={mode} onChange={e=>setMode(e.target.value)}><option value="forecast">모델 예보</option><option value="demo">시연 예보</option><option value="all">전체 예보</option></select></label>
        <button onClick={() => setRefresh(v => v+1)}>새로고침</button>
        </div>
      {error && <div className="admin-stats-error" role="alert"><p>{error}</p><button onClick={()=>setRefresh(v=>v+1)}>{language === "en" ? "Retry statistics" : "통계 다시 불러오기"}</button></div>}
      {data ? <CityStats data={data} ai={{token:key, days, mode}}/> : <StatsUnavailable loading={!error}/>}
      </section> : <IntegrationDashboard token={key} onUnauthorized={()=>{setKey("");setError("관리자 접속키를 확인하세요.");}}/>}
    </>
  </main>;
}
