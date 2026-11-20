import React, { useEffect, useState } from "react";
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

  return <main className="adminView">
    <div className="admin-nav"><a className="admin-back" href="/">← 뒤로가기</a><LanguageSwitch/></div>
    <a href="/" className="adminBrand"><img src="/favicon.svg" alt=""/>DePartner</a>
    <h1>동해시 관광 운영 통계</h1>
    {!key ? <form className="adminPanel" onSubmit={e => {e.preventDefault(); setTab("stats"); setKey(input.trim()); setInput("");}}>
      <label>관리자 접속키<input type="password" required autoComplete="current-password" value={input} onChange={e => setInput(e.target.value)}/></label>
      <button>통계 열기</button></form> : <>
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
      {data ? <CityStats data={data}/> : <StatsUnavailable loading={!error}/>}
      </section> : <IntegrationDashboard token={key} onUnauthorized={()=>{setKey("");setError("관리자 접속키를 확인하세요.");}}/>}
    </>}
    {!key && error && <p role="alert">{error}</p>}
  </main>;
}
