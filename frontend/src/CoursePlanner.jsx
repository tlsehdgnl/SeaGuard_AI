import { CourseMap } from "./CourseMap.jsx";
import coordinates from "./routeCoordinates.json";
import React, { useState, useEffect } from "react";
import { activities, beachRegion, regions, shops, shopCategory } from "./nearby.js";

export function CoursePlanner({ indoorPlaces, loading, profile, start, weather, activityNames, conditions, forecastText }) {
  const [result, setResult] = useState(null);
  const [attempt, retry] = useState(0);
  const [error, setError] = useState("");
  const region = beachRegion[profile.beach];
  const required = new Set(profile.stops);
  const places = Object.entries(shops).flatMap(([key, rows]) => rows.map(([name, kind, address]) => ({
    name, detail: [regions[key], kind, address].join(" · "), required: required.has(name),
  })));
  places.push(...indoorPlaces.map(place => ({name:place.name, detail:[place.address,...place.checks].join(" · ").slice(0,190), required:true})));
  const selected = profile.stops.map(name => places.find(place => place.name === name)).filter(Boolean);
  const wishes = profile.activity;
  const wanted = [];
  for (const [activity, category] of [["food", "식당"], ["cafe", "카페·간식"]]) {
    if (!wishes.includes(activity)) continue;
    const rows = shops[region].filter(([,kind]) => shopCategory(kind) === category);
    if (rows.some(([name]) => required.has(name))) continue;
    wanted.push(...rows.slice(0, 1));
  }
  const optional = (profile.budget === "free" ? [] : wanted)
    .map(([name,kind,address]) => ({ name, detail: kind+" · "+address }));
  if (weather?.risk.level === "low") {
    for (const [name,detail] of activities[region]) {
      if (name !== start && (profile.budget !== "free" || /산책|사진|걷기|풍경/.test(detail)))
        optional.push({ name, detail: regions[region]+" · "+detail });
    }
  }
  if (!selected.length && !optional.length && profile.budget !== "free") {
    const [name, kind, address] = shops[region].find(([,kind]) => shopCategory(kind) === "카페·간식");
    optional.push({ name, detail: kind+" · "+address });
  }
  const candidates = [...selected, ...optional.filter(place => !required.has(place.name))];
  const minutes = profile.time_budget === "any" ? Infinity : Number(profile.time_budget);
  const payload = candidates.length && !loading ? JSON.stringify({
    start, activities: activityNames, conditions, weather: forecastText, origin: coordinates[start],
    candidates: candidates.map(stop => ({ ...stop, point: coordinates[stop.name] })),
    extras: Math.min(optional.length, Math.max(0, Math.floor(minutes / 30) - selected.length)),
  }) : "";
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    const places = JSON.parse(payload).candidates;
    setResult(null);
    setError("");
    async function generate() {
      try {
        const res = await fetch((import.meta.env.VITE_API_BASE_URL || "")+"/api/course", {
          method:"POST", headers:{"Content-Type":"application/json"}, body:payload, signal:controller.signal,
        });
        if (!res.ok) throw Error();
        const response = await res.json();
        if (!controller.signal.aborted) setResult({source:response.source, stops:response.order.map(i => places[i])});
      } catch {
        if (!controller.signal.aborted) setError("코스를 불러오지 못했어요.");
      }
    }
    generate();
    return () => controller.abort();
  }, [payload, attempt]);
  return <section className="course-planner">
    <h3>관광 코스</h3>
    <p>출발 · {start}</p>
    {!!selected.length && <p>동선에 담은 곳 · {profile.stops.join(" → ")}</p>}
    {(!result && !error && (loading || payload)) && <p role="status">방문 순서를 정하고 있어요…</p>}
    {!loading && !candidates.length && <p>주변 활동에서 들르고 싶은 곳을 동선에 추가해 주세요.</p>}
    {error && <p role="alert">{error} <button onClick={() => retry(n => n+1)}>다시 조회</button></p>}
    {result && <div aria-live="polite"><h4>{result.source === "ai" ? "AI 추천 방문 순서" : "거리 기반 방문 순서"} · 출발 포함 {result.stops.length+1}곳</h4>
      {result.source === "basic" && <p className="hint">AI 응답을 사용할 수 없어 위치를 기준으로 방문 순서를 계산했어요.</p>}
      <ol>{[{name:start},...result.stops].map(({name,detail}) => <li key={name}><a target="_blank" rel="noreferrer"
        href={"https://map.naver.com/p/search/"+encodeURIComponent("동해시 "+name)}>{name} ↗</a>{detail && <p>{detail}</p>}</li>)}</ol>
      <CourseMap names={[start,...result.stops.map(stop => stop.name)]} />
      <p className="hint">이동시간과 영업 여부는 각 장소의 지도에서 확인하세요.</p>
    </div>}
  </section>;
}
