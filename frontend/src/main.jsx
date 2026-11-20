import { MyPage } from "./MyPage.jsx";
import { listPlans, savePlan, PLAN_PREFIX } from "./savedPlans.js";
import { CoursePlanner } from "./CoursePlanner.jsx";
import { weatherSummary } from "./weatherSummary.js";
import { BEACHES, destinationName } from "./beaches.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { activities, beachRegion, regions, shops, shopCategory, shopSearches } from "./nearby.js";
import QRCode from "qrcode";
import {
  ACTIVITY_LABELS, PLACE_NAMES,
  TIME_OPTIONS,
  STORAGE_KEY,
  FEEDBACK_KEY,
  initialProfile,
  sanitizeProfile,
  profileParams,
  readStorage,
  writeStorage,
  shareUrl,
  appendFeedback,
} from "./preferences.js";
import "./style.css";
import "./journey.css";
import Admin from "./Admin.jsx";
import { LanguageProvider, LanguageSwitch, useLanguage, translate } from "./i18n.js";
import { track, trackLink } from "./analytics.js";

const BASE = import.meta.env.VITE_API_BASE_URL || "";
function BeachIntro({ beach, name }) {
  const { source, description } = BEACHES.find(item => item.id === beach);
  const cityPhoto = typeof source === "number";
  const [failed, setFailed] = useState(false);
  return <article className="beach-intro" aria-live="polite">
    {!failed && <img src={`${import.meta.env.BASE_URL}beaches/${beach}.jpg`} alt={`${name} 전경`} onError={() => setFailed(true)} />}
    <div><h3>{name}</h3><p>{description}</p>
      <a href={cityPhoto ? `https://www.dh.go.kr/tour/selectTourCntntsWebView.do?key=1620&ctgryNo=4&tourNo=${source}` : source} target="_blank" rel="noreferrer">사진 출처 · {cityPhoto ? "동해시 관광 안내" : "행복한섬길 탐방기"} ↗</a>
    </div>
  </article>;
}

const OFFICIAL = [
  {
    id: "weather",
    title: "기상청 특보 확인",
    url: "https://www.weather.go.kr/w/special-report/overall.do",
    description: "동해시·동해 앞바다의 발표 시각과 구역을 확인하세요.",
  },
  {
    id: "swell",
    title: "기상청 해양기상 · 너울 정보",
    url: "https://marine.kma.go.kr",
    description: "너울 예측정보에서 해당 해안과 시간대를 확인하세요.",
  },
  {
    id: "local",
    title: "동해시 관광 공식 안내",
    url: "https://www.dh.go.kr/tour/index.do",
    description: "현장 통제와 안전요원 운영은 현장 안내소에서 확인하세요.",
  },
];
const formatTime = (value, language) =>
  value
    ? new Date(value).toLocaleString(language === "en" ? "en-US" : "ko-KR", { timeZone: "Asia/Seoul" }) +
      " KST"
    : "없음 · 고정 예시";
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
async function request(path, signal) {
  const response = await fetch(BASE + path, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      typeof data?.detail?.message === "string"
        ? data.detail.message
        : `안내를 불러오지 못했습니다 (${response.status}).`,
    );
  return data;
}
function Outdoor({ profile, weather, onStopsChange }) {
  const {language} = useLanguage();
  const region = beachRegion[profile.beach];
  const beach = destinationName(profile.beach);
  const wantsCafe = profile.activity.includes("cafe");
  const wantsFood = profile.activity.includes("food");
  const [category, setCategory] = useState(wantsCafe && wantsFood ? "식당·카페" : !wantsCafe && !wantsFood ? "전체" : wantsCafe ? "카페·간식" : "식당");
  const [shopLimit, setShopLimit] = useState(6);
  const [activityLimit, setActivityLimit] = useState(3);
  const map = query => "https://map.naver.com/p/search/" + encodeURIComponent("동해시 " + query);
  const cafes = shops[region].filter(([,kind]) => shopCategory(kind) === "카페·간식");
  const meals = shops[region].filter(([,kind]) => shopCategory(kind) === "식당");
  const localShops = category === "식당·카페"
    ? Array.from({length:Math.max(cafes.length,meals.length)}, (_, i) => [cafes[i],meals[i]]).flat().filter(Boolean)
    : shops[region].filter(([, kind]) => category === "전체" || shopCategory(kind) === category);
  const showOtherRegions = localShops.length === 0;
  const visibleShops = showOtherRegions
    ? Object.entries(shops).flatMap(([key, rows]) => rows.filter(([, kind]) => shopCategory(kind) === category)
      .map(row => [...row, regions[key]]))
    : localShops;
  const localActivities = [...activities[region]].sort(([a], [b]) =>
    Number(b === beach) - Number(a === beach));
  const beachIdeas = {
    photo: "백사장에서 해안 풍경 사진 찍기",
    sunrise: "일출 시각에 맞춰 백사장에서 바다 바라보기",
    picnic: "이용이 허용된 휴식 공간에서 간단한 피크닉 즐기기",
    cleanup: "마른 모래사장을 걸으며 작은 쓰레기 줍기",
  };
  const ideas = profile.activity.map(key => beachIdeas[key]).filter(Boolean);
  if (ideas.length && !BEACHES.find(item => item.id === profile.beach).port) {
    const target = beach;
    const existing = localActivities.findIndex(([place]) => place === target);
    if (existing >= 0) localActivities.splice(existing, 1);
    localActivities.unshift([target, ideas.join(" · ")]);
  }
  return <section className="alternatives card options nearby">
    <h2>실외 활동과 주변 가게</h2>
    {language === "en" && <p className="hint">Shop names and addresses keep their original Korean spelling for local maps.</p>}
    <h3>{regions[region]} 가게</h3>
    <Select label="가게 종류" value={category}
      options={["전체", ...(wantsCafe && wantsFood ? ["식당·카페"] : []), ...Object.keys(shopSearches)].map(kind => [kind, kind])}
      onChange={kind => {setCategory(kind); setShopLimit(6);}} />
    {showOtherRegions && <p className="hint">동해시 다른 권역에서 찾은 {category}도 함께 볼 수 있어요.</p>}
    <p className="hint">{visibleShops.length}곳 · 카드를 누르면 동선에 담겨요.</p>
    <ul className="shop-cards">{visibleShops.slice(0,shopLimit).map(([name,kind,address,,area]) => {
      const selected = profile.stops.includes(name);
      return <li key={name} data-place-name={name} className={"route-card" + (selected ? " is-selected" : "")}>
        <button type="button" className="route-toggle" aria-pressed={selected}
          onClick={() => onStopsChange(selected ? profile.stops.filter(stop => stop !== name) : [...profile.stops, name])}>
          {name}</button>
        <p>{area && area+" 권역 · "}{kind} · {address}</p>
        <a href={map(name)} target="_blank" rel="noreferrer">네이버 지도에서 {name} 검색 ↗</a>
      </li>;
    })}</ul>
    {visibleShops.length > shopLimit && <button type="button" onClick={() => setShopLimit(shopLimit + 6)}>가게 더 보기 ({visibleShops.length-shopLimit}곳 남음)</button>}
    <p className="hint">영업시간과 메뉴는 방문 전에 확인하세요.</p>
    <div className="nearby-links">{(shopSearches[category] || ["식당","카페","술집","놀거리"]).map(kind => <a key={kind} href={map(beach+" 주변 "+kind)} target="_blank" rel="noreferrer">주변 {kind} 검색 ↗</a>)}</div>
    <h3>바깥에서 즐길 거리</h3>
    {weather?.risk?.level !== "low" ? <p>주의 신호가 있거나 예보를 확인할 수 없어 야외 코스 추천을 보류합니다.</p> :
      <><p className="hint">{weather.meta.is_demo && "예시 조건으로 보는 코스입니다. "}출발 전에 현장 통제와 개방 여부를 확인하세요.</p>
      <ul>{localActivities.slice(0,activityLimit).map(([place,description]) => <li key={place} data-place-name={place}><strong>{place}</strong><p>{description}</p>
        <div className="nearby-links"><a href={map(place)} target="_blank" rel="noreferrer">위치·경로 확인 ↗</a></div></li>)}</ul>
      {activityLimit < localActivities.length && <button type="button" onClick={() => setActivityLimit(localActivities.length)}>활동 더 보기 ({localActivities.length-activityLimit}곳 남음)</button>}
      {(profile.mobility !== "any" || profile.transport==="transit" || profile.time_budget!=="any" || profile.budget!=="any") && <p>선택한 이동 조건·소요시간·비용은 출발 전 별도 확인이 필요합니다.</p>}</>}
    <div className="nearby-links"><a href="https://www.dh.go.kr/tour/index.do" target="_blank" rel="noreferrer">동해시 공식 관광 안내 ↗</a></div>
  </section>;
}

function LibraryPrograms() {
  const {language} = useLanguage();
  const [data,setData] = useState(null);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refreshInterval = 60 * 60_000;
    let pending = false;
    let lastAttempt = null;
    let timer;
    async function refresh() {
      if (document.hidden || pending) return;
      clearTimeout(timer);
      const remaining = lastAttempt === null ? 0 : refreshInterval - (Date.now() - lastAttempt);
      if (remaining > 0) {
        timer = window.setTimeout(refresh, remaining);
        return;
      }
      pending = true;
      lastAttempt = Date.now();
      try {
        const next = await request("/api/programs", controller.signal);
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, refreshInterval);
      }
    }
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      controller.abort();
    };
  }, [attempt]);
  return <section className="programs"><h3>도서관 행사·강좌 일정</h3>
    {language === "en" && <p className="hint">Official program titles are shown in their original Korean.</p>}
    <p className="hint">목록을 보는 동안 1시간마다 자동 갱신합니다.</p>
    {error && <p role="status">{error} {data && "마지막으로 확인한 일정을 표시합니다."}</p>}
    {!data && !error && <p role="status">공식 일정을 확인하고 있어요…</p>}
    {data && <>
      <p className="hint">접수중·대기접수·접수예정 목록과 최근 공지를 함께 확인합니다. 기간 중 실제 수업일과 신청 가능 여부는 상세 안내를 확인하세요. 마지막 확인 {formatTime(data.checked_at, language)}</p>
      {data.open_count != null && !error && <p><strong>접수 중 {data.open_count}건</strong></p>}
      {data.missing?.length > 0 && <p role="status">{data.missing.join(" · ")} 목록을 확인하지 못했습니다. 공식 사이트에서 확인해 주세요.</p>}
      {data.items.length ? <ul>{data.items.map(item => <li key={item.url+item.title}>
        <a lang={language === "en" ? "ko" : undefined} href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>
        <p>{item.branch} · {item.place} · {item.period} {item.hours}</p>
        <small>접수 {item.registration || "원문 확인"} · <span className={item.status.replace(/\s/g, "") === "접수종료" ? "registration-closed" : undefined}>{item.status}</span> {item.is_open && item.days_left != null && <strong>{item.days_left === 0 ? "D-day" : `D-${item.days_left}`}</strong>}</small>
      </li>)}</ul> : <p>{data.missing?.length ? "확인된 목록에 표시할 강좌가 없습니다." : "조회한 목록에 기간이 남은 강좌가 없습니다."}</p>}
    </>}
    <div className="toolbar"><a href="https://www.donghaelib.go.kr/web/menu/10027/program/30010/lectureList.do" target="_blank" rel="noreferrer">전체 일정·신청 ↗</a>
    {(data || error) && <button onClick={() => setAttempt(n => n+1)}>일정 새로 조회</button>}</div>
  </section>;
}

function PlanSummary({ indoorPlaces, profile, beachName, activityNames, weather, loading }) {
  const conditions = [
    profile.children && "어린이 동반",
    { stroller: "유모차 동반", step_free: "계단 없는 이동" }[profile.mobility],
    { car: "차량 이용", transit: "대중교통" }[profile.transport],
    profile.budget === "free" && "무료 활동",
    profile.time_budget !== "any" && `이동 포함 ${profile.time_budget}분 이내`,
  ].filter(Boolean).join(" · ") || "별도 조건 없음";
  const forecast = weather && weatherSummary(weather.values);
  const forecastText = forecast
    ? `${weather.meta.is_demo ? "시연용 예시" : "모델 예보"} · ${forecast.title}. ${forecast.detail}`
    : loading ? "날씨를 불러오는 중이에요." : "현재 예보를 확인할 수 없어요.";
  return <section className="card plan-summary">
    <h2>{beachName} 방문 계획</h2>
    <dl>{[["하고 싶은 활동", activityNames], ["동행·이동 조건", conditions], ["바닷가 날씨", forecastText]].map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <CoursePlanner indoorPlaces={indoorPlaces} loading={loading} key={JSON.stringify([profile,forecastText])} profile={profile} start={beachName}
      weather={weather} conditions={conditions} activityNames={activityNames} forecastText={forecastText} />
  </section>;
}

function WeatherCard({ weather, beachName }) {
  const { scene, title, detail } = weatherSummary(weather.values);
  return <div className="card weather-postcard">
    <div className={`weather-sketch sketch-${scene}`} aria-hidden="true" />
    <div><p className="eyebrow">{beachName} · {weather.meta.is_demo ? "예시 날씨" : "현재 시간대 예보"}</p>
      <h2>{title}</h2><p>{detail}</p></div>
  </div>;
}

function Outlook({beach, mode}) {
  const {language} = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setResult(null);
    const timeout = setTimeout(() => controller.abort(), 15000);
    request(`/api/outlook/${beach}?mode=${mode}`, controller.signal)
      .then(data => { if (active) setResult(data); })
      .catch(() => { if (active) setError("시간대별 예보를 불러오지 못했습니다."); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [beach, mode, attempt]);
  return <section className="outlook card">
    <h2>방문 시간별 파도·바람 비교</h2>
    {(error ? <p role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>다시 조회</button></p> :
      !result ? <p role="status">시간대별 예보를 확인하고 있어요…</p> : <>
        <table><caption>{mode === "demo" ? "고정 예시 · 실제 예보가 아닙니다" : "Open-Meteo 시간대별 모델 예보 · 한국시간"}</caption>
          <thead><tr><th>시간대</th><th>파고</th><th>풍속</th></tr></thead>
          <tbody>{result.points.map(point => <tr key={point.hours}><th scope="row">{point.hours ? point.hours + "시간 뒤" : "현재 시간대"}{point.time && <small>{new Date(point.time).toLocaleString(language === "en" ? "en-US" : "ko-KR", {timeZone:"Asia/Seoul", month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</small>}</th><td>{point.wave.toFixed(1)} m</td><td>{point.wind.toFixed(1)} m/s</td></tr>)}</tbody>
        </table><p className="hint">시간대별 수치를 비교한 뒤 방문 전 공식 특보와 현장 통제를 확인하세요.</p>
      </>)}
  </section>;
}
const STEPS = ["방문지 선택", "활동 선택", "바다 브리핑", "주변 활동", "저장·공유"];
function App() {
  const {language} = useLanguage();
  const [entering, setEntering] = useState(false);
  const entryTimer = useRef(null);
  useEffect(() => () => clearTimeout(entryTimer.current), []);
  function startJourney() {
    if (entryTimer.current !== null) return;
    track("start");
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEntering(true);
    entryTimer.current = setTimeout(() => {setStarted(true); setEntering(false); go(0);}, reduced ? 0 : 950);
  }
  const [started, setStarted] = useState(() => new URLSearchParams(location.hash.slice(1)).has("beach"));
  const trackedPlan = useRef("");
  const [step, setStep] = useState(() => new URLSearchParams(location.hash.slice(1)).has("beach") ? 2 : 0);
  const flowHeading = useRef(null);
  function go(next) {
    setStep(next);
    requestAnimationFrame(() => {
      flowHeading.current?.focus({preventScroll:true});
      window.scrollTo(0,0);
    });
  }
  const [plans, setPlans] = useState(() => listPlans(storage()));
  const [myPage, setMyPage] = useState(false);
  function showMyPage(open) {
    setMessage("");
    setMyPage(open);
    if (open) setPlans(listPlans(storage()));
    requestAnimationFrame(() => {flowHeading.current?.focus({preventScroll:true}); window.scrollTo(0,0);});
  }
  useEffect(() => {
    const sync = e => {
      if (!e.key || e.key === STORAGE_KEY || e.key.startsWith(PLAN_PREFIX)) setPlans(listPlans(storage()));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [profile, setProfile] = useState(() =>
    initialProfile(
      window.location.hash,
      plans[0]?.profile,
    ),
  );
  const [excluded, setExcluded] = useState([]);
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState(""),
    [visited, setVisited] = useState([]);
  const [feedback, setFeedback] = useState(() => {
    const items = readStorage(storage(), FEEDBACK_KEY, []);
    return Array.isArray(items)
      ? items
          .filter(
            (item) =>
              item &&
              typeof item.place_id === "string" &&
              typeof item.reason === "string",
          )
          .slice(-30)
      : [];
  });
  const [share, setShare] = useState(false),
    [qr, setQr] = useState(""),
    [qrError, setQrError] = useState("");
  const [large, setLarge] = useState(false),
    [speaking, setSpeaking] = useState(false);
  const shareButton = useRef(null);
  const params = profileParams(profile);
  params.delete("stops");
  params.set("exclude", excluded.join(","));
  const requestKey = params.toString();
  const data =
    result?.key === requestKey && result.refresh === refresh
      ? result.data
      : null;
  const weather = data?.weather;
  const indoorPlaces = data ? [...data.alternatives.candidates, ...data.alternatives.needs_check] : [];
  const usableStops = profile.stops.filter(name => !Object.values(PLACE_NAMES).includes(name) ||
    indoorPlaces.some(place => place.name === name));
  const activityNames = profile.activity.map(key => ACTIVITY_LABELS[key]).join(" · ");
  const url = shareUrl(window.location.href, profile);
  const beachName = destinationName(profile.beach);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    const timeout = setTimeout(() => controller.abort(), 25000);
    const delay = setTimeout(() => {
      request(`/api/guide/${profile.beach}?${requestKey}`, controller.signal)
        .then((value) => {
          if (active) setResult({ key: requestKey, refresh, data: value });
        })
        .catch((e) => {
          if (active)
            setError(
              e.name === "AbortError"
                ? "요청 시간이 초과되었습니다. 다시 시도해 주세요."
                : e.message,
            );
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(delay);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [requestKey, refresh]);
  useEffect(() => {
    setVisited([]);
    setQr("");
    setShare(false);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [requestKey]);
  useEffect(() => {
    const onHash = () => {
      if (!new URLSearchParams(window.location.hash.slice(1)).has("beach")) return;
      setProfile(initialProfile(window.location.hash, null));
      setStarted(true);
      setMyPage(false);
      go(2);
      setExcluded([]);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!share) return;
    let active = true;
    setQr("");
    setQrError("");
    QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: { dark: "#153b42", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active)
          setQrError("QR 생성에 실패했습니다. 아래 링크를 복사해 주세요.");
      });
    return () => {
      active = false;
    };
  }, [share, url]);
  useEffect(() => {
    if (!started || myPage || step !== 4 || !weather) return;
    const signature = JSON.stringify([profile, refresh]);
    if (trackedPlan.current === signature) return;
    trackedPlan.current = signature;
    track("plan_seen", profile.beach, "", profile.mode === "demo", {
      risk: weather.risk.label,
      car: profile.transport === "any" ? null : profile.transport === "car",
    });
  }, [started, myPage, step, weather, profile, refresh]);

  function change(key, value) {
    setProfile((p) => ({ ...p, [key]: value }));
    setExcluded([]);
    setMessage("");
  }
  function toggleActivity(key) {
    if (!profile.activity.includes(key)) return change("activity", [...profile.activity, key]);
    if (profile.activity.length > 1) return change("activity", profile.activity.filter(item => item !== key));
    setMessage("활동을 하나 이상 선택해 주세요.");
  }
  function save() {
    try {
      savePlan(storage(), profile);
      setPlans(listPlans(storage()));
      setMessage("마이페이지에 계획을 저장했어요.");
    } catch { setMessage("이 브라우저에 저장할 수 없어요. 공유 링크로 조건을 보관해 주세요."); }
  }
  function deleteSaved(key) {
    try {
      storage().removeItem(key);
      setPlans(listPlans(storage()));
      setMessage("계획을 삭제했어요.");
    } catch { setMessage("삭제하지 못했어요. 브라우저 저장 설정을 확인해 주세요."); }
  }
  function openSaved(p) {
    window.history.replaceState(null, "", shareUrl(window.location.href, p));
    setProfile(p);
    setExcluded([]);
    setRefresh(n => n+1);
    setMyPage(false);
    setMessage("");
    go(4);
  }
  function toggleStop(name) {
    setProfile(prev => ({ ...prev, stops: prev.stops.includes(name)
      ? prev.stops.filter(stop => stop !== name) : [...prev.stops, name] }));
  }
  function giveFeedback(place, reason) {
    const history = appendFeedback(feedback, {
      place_id: place.id,
      reason,
      at: new Date().toISOString(),
    });
    setFeedback(history);
    const persisted = writeStorage(storage(), FEEDBACK_KEY, history);
    setExcluded((old) => [...new Set([...old, place.id])]);
    setMessage(
      `${place.name}을 이번 목록에서 제외했습니다. ${persisted ? "의견은 이 브라우저에만 저장됩니다." : "의견을 저장하지 못했지만 이번 목록에는 반영했습니다."}`,
    );
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        "공유 링크를 복사했습니다. 받는 사람은 같은 조건으로 최신 안내를 다시 조회합니다.",
      );
    } catch {
      setMessage(
        "자동 복사가 지원되지 않습니다. 공유 링크 칸을 선택해 직접 복사해 주세요.",
      );
    }
  }
  function speak() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setMessage("이 브라우저에서는 음성 읽기를 지원하지 않습니다.");
      return;
    }
    const text = [
      `${beachName}.`,
      profile.mode === "demo"
        ? "시연용 예시입니다. 실제 상태가 아닙니다."
        : "외부 모델 예보 안내입니다.",
      ...(weather ? [weatherSummary(weather.values).title, weatherSummary(weather.values).detail] : []),
      ...(data?.actions || []).map((a) => a.text),
    ].join(" ");
    const speech = new SpeechSynthesisUtterance(translate(text, language));
    speech.lang = language === "en" ? "en-US" : "ko-KR";
    speech.rate = 0.95;
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => {
      setSpeaking(false);
      setMessage("음성 읽기를 사용할 수 없습니다. 화면의 안내를 확인하세요.");
    };
    window.speechSynthesis.speak(speech);
    setSpeaking(true);
  }
  if (!started) return <main className={`horizon${entering ? " is-entering" : ""}`} aria-busy={entering}>
    <div className="horizon-ocean" aria-hidden="true"/>
    <LanguageSwitch className="landing-language"/>
    <a className="landing-admin" href="/admin">관리자 통계 보기</a>
    <div className="landing-copy"><h1>동해로 여행을<br/>떠나볼까요?</h1>
      <button className="journey-start" disabled={entering} onClick={startJourney}>여행 시작하기 <span aria-hidden="true">→</span></button>
    </div>
  </main>;
  return (
    <div className={`${large ? "app large-text" : "app"} journey-app step-${step}${myPage ? " is-my-page" : ""}`}
      onClickCapture={event => trackLink(event, profile)}>
      <a className="skip-link" href="#content">
        본문으로 이동
      </a>
      <header>
        <a className="brand" href="/">
          ≈{" "}
          <span>
            SeaGuard <b>AI</b>
          </span>
        </a>
        <div className="header-tools"><LanguageSwitch/><a className="admin-link" href="/admin">관리자 통계</a><span className="location">
          동해 바다행동 안내 <span className="dot">●</span>
        </span><button onClick={() => showMyPage(!myPage)}>{myPage ? "여행 계획" : "마이페이지"}</button></div>
      </header>
      <main id="content">
        {myPage ? <MyPage plans={plans} onOpen={openSaved} onDelete={deleteSaved} onBack={() => showMyPage(false)} headingRef={flowHeading} message={message} /> : <>
        <div className="step-head">
          <div className="step-meta"><span>여행 준비 · {step+1} / {STEPS.length}</span>{step>0 && <button onClick={()=>go(step-1)}>← 이전</button>}</div>
          <h1 ref={flowHeading} tabIndex={-1}>{["어느 해변이나 항구에 가시나요?", "무엇을 하고 싶으세요?", beachName+" 방문 브리핑", beachName+" 주변에서 할 일", "이 계획을 다시 볼까요?"][step]}</h1>
          {step>0 && <p>{beachName} · {activityNames}{profile.children?" · 어린이 동반":""} · {profile.mode==="demo"?"예시 데이터":"모델 예보"}</p>}
        </div>
        {step===0 && <>
        <section id="plan" className="card plan">
          <div className="section-heading">
            <div>

              <h2>방문할 해변·항구</h2>
            </div>
            <button
              className="text-size-toggle"
              aria-pressed={large}
              onClick={() => setLarge(!large)}
            >
              글자 {large ? "기본 크기" : "크게"}
            </button>
          </div>
          <div className="tabs destination-tabs" aria-label="방문지 선택">
            {BEACHES.map((b) => (
              <button
                key={b.id}
                aria-pressed={profile.beach === b.id}
                className={profile.beach === b.id ? "selected" : ""}
                onClick={() => change("beach", b.id)}
              >
                {destinationName(b.id)}
              </button>
            ))}
          </div>
          <BeachIntro key={profile.beach} beach={profile.beach} name={beachName} />
        </section>
        </>}
        {step===1 && (
        <section className="card plan" id="activity"><h2>활동과 동행 조건</h2><p className="hint">하고 싶은 활동을 모두 골라 주세요.</p>
          <div className="quick-row">
            <div className="activity-postcards" role="group" aria-label="활동 선택">
              {Object.entries(ACTIVITY_LABELS).map(([key, title], index) => (
                <button key={key} type="button" aria-pressed={profile.activity.includes(key)}
                  onClick={() => toggleActivity(key)}>
                  <span aria-hidden="true" className="postcard-art" style={{
                    backgroundPosition: `${(index % 2) * 100}% ${Math.floor(index / 2) * 100 / 3}%`,
                  }} />
                  <span className="postcard-label">{title}</span>
                </button>
              ))}
            </div>
          <label className="check">
            <input
              type="checkbox"
              checked={profile.children}
              onChange={(e) => change("children", e.target.checked)}
            />{" "}
            어린이와 함께 가요
          </label>
          </div>
          <h3>이동·비용·시간 조건</h3><div className="form-grid">
            <Select
              label="이동 시 필요한 배려"
              value={profile.mobility}
              onChange={(v) => change("mobility", v)}
              options={[
                ["any", "선택 안 함"],
                ["stroller", "유모차 동반"],
                ["step_free", "계단 없는 이동 필요"],
              ]}
            />
            <Select
              label="이동 수단"
              value={profile.transport}
              onChange={(v) => change("transport", v)}
              options={[
                ["any", "선택 안 함"],
                ["car", "차량 이용"],
                ["transit", "차량 없음 · 대중교통"],
              ]}
            />
            <Select
              label="대체 활동 비용"
              value={profile.budget}
              onChange={(v) => change("budget", v)}
              options={[
                ["any", "유료 활동도 괜찮아요"],
                ["free", "무료 활동만 찾기"],
              ]}
            />
            <Select
              label="이동을 포함한 남은 시간"
              value={profile.time_budget}
              onChange={(v) => change("time_budget", v)}
              options={TIME_OPTIONS}
            />
          </div>
        </section>
        )}
        {step===2 && <>
        <div
          id="forecast" className={`notice ${profile.mode === "demo" ? "demo" : ""}`}
          role="note"
        >
          <strong>
            {profile.mode === "demo"
              ? "DEMO · 실제 해변 상태가 아닙니다"
              : "MODEL · 현장 관측이 아닌 격자 예보"}
          </strong>
            <Select
              label="데이터 모드"
              value={profile.mode}
              onChange={(v) => change("mode", v)}
              options={[
                ["demo", "예시 데이터 · 시연"],
                ["forecast", "외부 모델 예보"],
              ]}
            />
        </div>
        {error ? (
          <section className="error" role="alert">
            <h2>정보 확인 필요</h2>
            <p>{error}</p>
            <button onClick={() => setRefresh((n) => n + 1)}>다시 시도</button>
            {profile.mode !== "demo" && (
              <button onClick={() => change("mode", "demo")}>
                예시 모드로 전환
              </button>
            )}
          </section>
        ) : !data ? (
          <section className="loading" role="status">
            선택한 조건으로 안내를 준비하고 있습니다…
          </section>
        ) : (
          <>
            {weather ? (
              <section className="weather-summary" aria-label={beachName + " 기상·해양 수치"}>
                <div className="dashboard">
                <WeatherCard weather={weather} beachName={beachName} />
                <div className="metrics">
                  <Metric
                    label="파고"
                    value={weather.values.wave_height}
                    unit="m"
                  />
                  <Metric
                    label="풍속"
                    value={weather.values.wind_speed}
                    unit="m/s"
                  />
                  <Metric
                    label="강수량"
                    value={weather.values.precipitation}
                    unit="mm"
                    subtitle={
                      weather.meta.is_demo
                        ? "시연용 값"
                        : `${weather.meta.precipitation_interval_seconds / 60}분 집계`
                    }
                  />
                  <Metric
                    label="기온"
                    value={weather.values.temperature}
                    unit="°C"
                    subtitle="방문지 주변 기온"
                  />
                </div>
              </div>
              </section>
            ) : (
              <section className="error" role="alert">
                <h2>정보 확인 필요</h2>
                <p>{data.weather_error?.message}</p>
                <p>
                  잠시 후 다시 조회하거나 아래 기상청 안내에서 날씨를 확인해 주세요.
                </p>
                <button onClick={() => setRefresh((n) => n + 1)}>
                  예보 다시 조회
                </button>
                <button onClick={() => change("mode", "demo")}>
                  예시 모드로 전환
                </button>
              </section>
            )}
          </>
        )}
        <Outlook key={profile.beach + profile.mode} beach={profile.beach} mode={profile.mode} />
        {data && (<>
            <section id="actions" className="card actions">
              <div className="section-heading">
                <div>

                  <h2>
                    {profile.children ? "아이와 함께, " : ""}
                    {activityNames} 전 확인할 행동
                  </h2>
                </div>
                <button onClick={speak}>
                  {speaking ? "읽기 중지" : "안내 읽어주기"}
                </button>
              </div>

              <ol>
                {data.actions.map((a) => (
                  <li key={a.id}>{a.text}</li>
                ))}
              </ol>
              <details className="ai-note"><summary>안내 근거와 AI 사용 여부</summary>
                <span className="badge">
                  {data.ai.source === "rules+llm"
                    ? "AI 근거 선택"
                    : "기본 맞춤 안내"}
                </span>
                <p>{data.ai.notice}</p>
                {data.ai.source === "rules+llm" && (
                  <p>
                    <strong>먼저 읽을 안내</strong> ·{" "}
                    {data.priority_actions.map((a) => a.text).join(" ")}
                  </p>
                )}
              </details>
            </section>
          </>
        )}

        <section className="card official">

          <h2>공식 정보까지 한 번 더 확인하세요</h2>
          <p className="hint">
            링크 방문 여부만 표시합니다. 통제 정보를 자동 조회하거나 확인 완료를
            보증하지 않습니다.
          </p>
          <div className="official-grid">
            {(data?.official_links || OFFICIAL).map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setVisited((v) => [...new Set([...v, link.id])])}
              >
                <strong>{link.title} ↗</strong>
                <span>{link.description}</span>
                <small>
                  {visited.includes(link.id)
                    ? "링크 방문함"
                    : "공식 사이트에서 확인"}
                </small>
              </a>
            ))}
          </div>
        </section>
            {weather && (
              <details className="provenance card"><summary>데이터의 출처와 시각</summary>
                <dl>
                  <div>
                    <dt>데이터 출처</dt>
                    <dd>{weather.meta.source}</dd>
                  </div>
                  <div>
                    <dt>기상 데이터 시각</dt>
                    <dd>{formatTime(weather.meta.data_times.weather, language)}</dd>
                  </div>
                  <div>
                    <dt>해양 데이터 시각</dt>
                    <dd>{formatTime(weather.meta.data_times.marine, language)}</dd>
                  </div>
                  <div>
                    <dt>조회 시각</dt>
                    <dd>{formatTime(weather.meta.retrieved_at, language)}</dd>
                  </div>
                </dl>
                {weather.meta.source_urls.map((link) => (
                  <a key={link} href={link} target="_blank" rel="noreferrer">
                    {link.includes("marine") ? "해양" : "기상"} API 출처 ↗
                  </a>
                ))}
              </details>
            )}
        </>}
        {step===3 && <>
        <section id="local-activities" aria-label="지역 활동 추천">
          <Outdoor key={profile.beach} profile={profile} weather={weather} onStopsChange={stops => setProfile(prev => ({...prev, stops}))} />
        </section>
        {data && (
          <>
            <section className="alternatives card options"><h2>실내 활동</h2>
              <LibraryPrograms />
              <h3>방문할 만한 시설</h3>
              <p className="sub">
                확인된 조건의 후보와 추가 확인이 필요한 후보를 나누어
                보여드려요.
                <br />
                {data.alternatives.notice}
              </p>
              {data.alternatives.candidates.length ? (
                <div className="place-grid">
                  {data.alternatives.candidates.map((p) => (
                    <Place key={p.id} place={p} onFeedback={giveFeedback} selected={profile.stops.includes(p.name)} onToggle={toggleStop} />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <strong>선택한 조건을 확인할 수 있는 후보가 없습니다.</strong>
                  <p>
                    조건을 완화하거나, 아래 후보에 필요한 사항을 먼저 문의해
                    주세요. 확인되지 않은 접근성·이동시간을 추정해 추천하지
                    않습니다.
                  </p>
                </div>
              )}
              {data.alternatives.needs_check.length > 0 && (
                <>
                  <h3>먼저 확인하면 검토할 수 있어요</h3>
                  <div className="place-grid">
                    {data.alternatives.needs_check.map((p) => (
                      <Place key={p.id} place={p} onFeedback={giveFeedback} selected={profile.stops.includes(p.name)} onToggle={toggleStop} />
                    ))}
                  </div>
                </>
              )}
              {data.alternatives.excluded.length > 0 && (
                <details className="excluded">
                  <summary>
                    이번 조건에서 제외한 장소{" "}
                    {data.alternatives.excluded.length}곳과 이유
                  </summary>
                  <ul>
                    {data.alternatives.excluded.map((p) => (
                      <li key={p.id}>
                        <strong>{p.name}</strong> ·{" "}
                        {p.exclusion_reasons.join(" / ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {excluded.length > 0 && (
                <button
                  onClick={() => {
                    setExcluded([]);
                    setMessage("이번 목록에서 제외한 장소를 다시 검토합니다.");
                  }}
                >
                  다른 후보 요청 초기화
                </button>
              )}
              <p className="hint">
                자료 확인일 {data.alternatives.checked_at} · 현장 실사나 실시간
                영업 확인일이 아닙니다.
              </p>
              <details className="feedback-history">
                <summary>이 브라우저의 추천 의견 ({feedback.length})</summary>
                <p>
                  의견은 이 기기에만 저장되며 기관에 전송되지 않습니다. 최대
                  30건을 보관합니다.
                </p>
                {feedback
                  .slice(-5)
                  .reverse()
                  .map((f, i) => (
                    <p key={i}>
                      {PLACE_NAMES[f.place_id] || f.place_id} · {f.reason}
                    </p>
                  ))}
                <button
                  onClick={() => {
                    if (writeStorage(storage(), FEEDBACK_KEY, [])) {
                      setFeedback([]);
                      setMessage("저장된 추천 의견을 삭제했습니다.");
                    } else
                      setMessage(
                        "의견 삭제에 실패했습니다. 브라우저 저장 설정을 확인하세요.",
                      );
                  }}
                >
                  내 의견 기록 삭제
                </button>
              </details>
            </section>
          </>
        )}
        {!data && <p role="status">{error || "지역 활동을 확인하고 있어요…"}</p>}
        </>}
        {step===4 && <>
        <PlanSummary indoorPlaces={indoorPlaces} profile={{...profile, stops: usableStops}} beachName={beachName} activityNames={activityNames}
          weather={weather} loading={!error && !data} />
        <section id="save-plan" className="card plan"><h2>조건 저장 · 공유</h2>
          <div className="toolbar">
            <button onClick={save}>☆ 조건 저장</button>
            <button onClick={() => showMyPage(true)}>저장한 계획 보기 ({plans.length})</button>
            <button
              ref={shareButton}
              aria-expanded={share}
              aria-controls="share-panel"
              onClick={() => setShare(!share)}
            >
              공유 · QR
            </button>
            <button onClick={() => setRefresh((n) => n + 1)}>
              ↻ 새로 조회
            </button>
          </div>
        </section>
        {share && (
          <section
            id="share-panel"
            className="card share-panel"
            aria-label="공유"
          >
            <div>
              <h2>같은 조건으로 함께 확인해요</h2>
              <p>
                이 링크는 해변·활동·동행 조건을 전달합니다. 과거의 위험 상태를
                저장하지 않으며, 열 때 다시 조회합니다.
              </p>
              <label className="share-label">
                공유 링크
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <div className="toolbar">
                <button onClick={copyLink}>링크 복사</button>
                <button
                  onClick={() => {
                    setShare(false);
                    shareButton.current?.focus();
                  }}
                >
                  닫기
                </button>
              </div>
              {qrError && <p role="alert">{qrError}</p>}
              <p className="hint">
                로컬 주소의 QR은 다른 기기에서 열리지 않을 수 있습니다. 배포 후
                공개 주소에서 공유하세요.
              </p>
            </div>
            {qr ? (
              <img
                src={qr}
                alt={`${beachName}과 선택한 조건을 여는 QR코드`}
                width="240"
                height="240"
              />
            ) : (
              <p>QR 준비 중…</p>
            )}
          </section>
        )}
        </>}
        <div className="status-message" role="status" aria-live="polite">
          {message}
        </div>
        {step===2 && (
        <details className="rules">
          <summary>날씨 안내는 어떻게 읽나요?</summary>
          <p>선택한 시간대의 강수량, 풍속, 파고로 바닷가 날씨를 설명해요. 방문 시간이 달라지면 시간대별 표에서 파도와 바람을 비교해 보세요.</p>
          <p>물놀이를 계획했다면 현장 안내소에서 입수 가능 여부와 안전요원 운영 시간을 확인하세요.</p>
        </details>
        )}
        <div className="step-controls">
          {step<4 ? <button className="step-next" onClick={()=>go(step+1)}>{["활동 선택하기","내 바다 브리핑 보기","주변 활동 찾아보기","계획 요약 보기"][step]} →</button> :
            <button className="step-next" onClick={()=>go(2)}>내 브리핑 다시 보기</button>}
          {step===0 && <button onClick={()=>{change("mode","demo");go(2);}}>예시 브리핑 미리보기</button>}
          {step>=2 && <button onClick={()=>go(0)}>방문지 다시 선택</button>}
        </div>
        </>}
        <footer>
          <span>SeaGuard AI · 동해 바다행동 안내</span>
          <span>정보 확인 → 행동 이해 → 지역 대안 선택</span>
        </footer>
      </main>
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Metric({ label, value, unit, subtitle }) {
  return (
    <article className="card metric">
      <div>{label}</div>
      <p>
        {value.toFixed(1)} <small>{unit}</small>
      </p>
      <small>{subtitle || "분석에 사용된 입력값"}</small>
    </article>
  );
}
function Place({ place, onFeedback, selected, onToggle }) {
  return (
    <article data-place-name={place.name} className={"card place route-card" + (selected ? " is-selected" : "")}>
      <div className="place-top">
        <span className="badge">{place.kind} · 실내 활동</span>
        <span
          className={
            place.match_status === "needs_check"
              ? "pending-tag"
              : "candidate-tag"
          }
        >
          {place.match_status === "needs_check"
            ? "조건 확인 필요"
            : "검토할 후보"}
        </span>
      </div>
      <h3><button type="button" className="route-toggle" aria-pressed={selected} onClick={() => onToggle(place.name)}>{place.name}</button></h3>
      <p>{place.reason}</p>
      <p className="address">{place.address}</p>
      <p className="fee">{place.fee_note}</p>
      {place.checks.length > 0 && (
        <ul className="checks">
          {place.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>이용 전 확인사항과 출처</summary>
        <ul>
          {place.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {place.sources.map((source) => (
          <a
            className="source-link"
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            {source.title} ↗<small>자료 확인 {source.checked_at}</small>
          </a>
        ))}
      </details>
      <div className="place-links">
        <a href={place.map_url} target="_blank" rel="noreferrer">
          위치·경로 확인 ↗
        </a>
        <a href={`tel:${place.phone}`}>전화 문의</a>
      </div>
      <details className="feedback">
        <summary>이 후보가 맞지 않나요?</summary>
        <div className="feedback-buttons">
          {[
            "이동이 어려워요",
            "비용이 부담돼요",
            "아이와 맞지 않아요",
            "시간이 부족해요",
          ].map((reason) => (
            <button key={reason} onClick={() => onFeedback(place, reason)}>
              {reason}
            </button>
          ))}
        </div>
      </details>
    </article>
  );
}
createRoot(document.getElementById("root")).render(<LanguageProvider>{["/admin", "/admin/"].includes(location.pathname) ? <Admin /> : <App />}</LanguageProvider>);
