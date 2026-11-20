// Kakao Local extras: nearby parking per stop, and "my lodging" with nearby convenience stores.
// Hidden quietly when the Kakao Local service is not configured.
import React, { useEffect, useState } from "react";
import { useKakaoConfig } from "./kakao.js";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const LODGING_KEY = "departner.lodging";
const walk = (m) => Math.max(1, Math.ceil((m || 0) / 67));  // ~4 km/h
const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);
const routeUrl = (a, b) => {
  const part = (p) => `${encodeURIComponent(p.name.replace(/[,/]/g, " ").trim())},${p.lat},${p.lng}`;
  return `https://map.kakao.com/link/from/${part(a)}/to/${part(b)}`;
};

function useNearby(lat, lng, kind) {
  const [state, setState] = useState({ data: null, off: false });
  useEffect(() => {
    if (lat == null || lng == null) return;
    const controller = new AbortController();
    fetch(`${base}/api/kakao/nearby?lat=${lat}&lng=${lng}&kind=${kind}`, { signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => setState({ data, off: false }))
      .catch((e) => { if (e.name !== "AbortError") setState({ data: null, off: true }); });
    return () => controller.abort();
  }, [lat, lng, kind]);
  return state;
}

const Pin = () => <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.2a5 5 0 0 0-5 5c0 3.6 5 8.6 5 8.6s5-5 5-8.6a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor" /></svg>;

/** "🅿️ 근처 주차장 N곳 · 가장 가까운 곳 150m" under a timeline stop; tap to see the nearest three. */
export function ParkingChip({ name, point }) {
  const [open, setOpen] = useState(false);
  const { data, off } = useNearby(point?.[0], point?.[1], "parking");
  if (!point || off || !data) return null;
  const nearest = data.items[0];
  if (!nearest) return <p className="parking-chip is-none"><span className="p-badge">P</span>반경 {dist(data.radius)} 안에 등록된 주차장이 없어요</p>;
  return <div className={"parking" + (open ? " is-open" : "")}>
    <button type="button" className="parking-chip" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="p-badge" aria-hidden="true">P</span>
      근처 주차장 <b>{data.count > 5 ? "5곳+" : `${data.count}곳`}</b> · 가장 가까운 곳 <b>{dist(nearest.distance)}</b>
      <span className="p-caret" aria-hidden="true">▾</span>
    </button>
    {open && <ul className="parking-list">
      {data.items.slice(0, 3).map((p) => <li key={p.id}>
        <span><strong>{p.name}</strong><small>{dist(p.distance)} · 도보 {walk(p.distance)}분</small></span>
        <a className="mini-kakao" href={routeUrl({ name, lat: point[0], lng: point[1] }, p)} target="_blank" rel="noreferrer"
          aria-label={`${name}에서 ${p.name}까지 카카오맵 길찾기 (새 창)`}><Pin />길찾기</a>
      </li>)}
      <li className="parking-note">실시간 빈자리 정보는 아니에요 · 카카오맵 장소 정보 기준</li>
    </ul>}
  </div>;
}

function readLodging() { try { return JSON.parse(localStorage.getItem(LODGING_KEY)); } catch { return null; } }

/** "My lodging": search once, then nearby convenience stores and a route from the last stop. */
export function LodgingCard({ lastStop }) {
  const config = useKakaoConfig();
  const [lodging, setLodging] = useState(readLodging);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [note, setNote] = useState("");
  const stores = useNearby(lodging?.lat, lodging?.lng, "convenience");
  function choose(p) {
    const value = { name: p.name, address: p.address, lat: p.lat, lng: p.lng, category: p.category };
    setLodging(value); setResults(null); setQuery("");
    try { localStorage.setItem(LODGING_KEY, JSON.stringify(value)); } catch { /* this visit only */ }
  }
  async function search(e) {
    e.preventDefault();
    if (query.trim().length < 2) { setNote("숙소 이름을 두 글자 이상 입력해 주세요."); return; }
    setNote("찾는 중…");
    try {
      const r = await fetch(`${base}/api/kakao/places?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "검색하지 못했어요.");
      setResults(d.items); setNote(d.items.length ? "" : "동해 근처에서 찾지 못했어요. 이름을 바꿔 검색해 보세요.");
    } catch (err) { setNote(err.message); }
  }
  if (!config.route) return null;  // Kakao REST key not configured
  return <section className="lodging-card" aria-labelledby="lodging-title">
    <div className="lodging-head"><span className="lodging-icon" aria-hidden="true">🏠</span>
      <div><h3 id="lodging-title">내 숙소</h3><p>{lodging ? "숙소 주변 편의점과 돌아가는 길을 알려드려요" : "머무는 곳을 등록하면 근처 편의점을 찾아드려요"}</p></div>
      {lodging && <button type="button" className="lodging-change" onClick={() => { setLodging(null); try { localStorage.removeItem(LODGING_KEY); } catch {} }}>변경</button>}
    </div>
    {!lodging && <form className="lodging-search" onSubmit={search} role="search">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 망상 펜션, 호텔 이름" aria-label="숙소 이름 검색" maxLength={40} />
      <button type="submit">검색</button>
    </form>}
    {note && <p className="lodging-note" role="status">{note}</p>}
    {results?.length > 0 && <ul className="lodging-results">{results.map((p) => <li key={p.id}>
      <button type="button" onClick={() => choose(p)}><strong>{p.name}</strong><small>{p.category} · {p.address}</small></button>
    </li>)}</ul>}
    {lodging && <>
      <div className="lodging-picked"><strong>{lodging.name}</strong><small>{lodging.address}</small></div>
      {lastStop && <a className="lodging-route" href={routeUrl(lastStop, lodging)} target="_blank" rel="noreferrer">
        <Pin /><span>마지막 방문지 <b>{lastStop.name}</b> → 숙소 길찾기</span><em>카카오맵</em></a>}
      <h4 className="lodging-sub">🏪 숙소 근처 편의점</h4>
      {stores.off ? <p className="lodging-note">편의점 정보를 불러오지 못했어요.</p>
        : !stores.data ? <p className="lodging-note">찾는 중…</p>
        : stores.data.items.length === 0 ? <p className="lodging-note">반경 500m 안에 편의점이 없어요. 출발 전에 미리 챙겨 두세요.</p>
        : <ul className="store-list">{stores.data.items.slice(0, 3).map((s, i) => <li key={s.id} className={i === 0 ? "is-nearest" : undefined}>
            <span className="store-rank">{i === 0 ? "가장 가까움" : `${i + 1}`}</span>
            <span className="store-name"><strong>{s.name}</strong><small>도보 {walk(s.distance)}분 · {dist(s.distance)}</small></span>
            <a className="mini-kakao" href={s.url || routeUrl(lodging, s)} target="_blank" rel="noreferrer" aria-label={`${s.name} 카카오맵에서 보기 (새 창)`}><Pin />카카오맵</a>
          </li>)}</ul>}
    </>}
  </section>;
}
