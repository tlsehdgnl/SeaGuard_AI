// Kakao helpers: feature flags, Maps SDK loader, live route fetch.
// Every feature degrades to the existing behaviour when keys are missing.
import { useEffect, useState } from "react";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || "";
export const TRAFFIC_COLORS = { smooth: "#18b45b", slow: "#ff9b1a", jam: "#e5383b", unknown: "#8fa3b3" };
export const TRAFFIC_LABELS = { smooth: "원활", slow: "서행", jam: "정체" };

let configPromise;
export function kakaoConfig(force = false) {
  if (!configPromise || force) {
    configPromise = fetch(base + "/api/kakao/config", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return configPromise;
}
export function useKakaoConfig() {
  const [config, setConfig] = useState({});
  useEffect(() => { let on = true; kakaoConfig().then((c) => on && setConfig(c)); return () => { on = false; }; }, []);
  return config;
}

let sdkPromise;
/** Loads the Kakao Maps JS SDK once (needs VITE_KAKAO_JS_KEY + the site domain registered in the Kakao app). */
export function loadKakaoMaps() {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error("no key"));
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  sdkPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    script.onerror = () => { sdkPromise = null; reject(new Error("sdk")); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** Car route through the stops with live traffic, or null when unavailable. */
export function useLiveRoute(points, enabled) {
  const key = JSON.stringify(points);
  const [state, setState] = useState({ route: null, error: "" });
  useEffect(() => {
    const pts = JSON.parse(key);
    if (!enabled || pts.length < 2) { setState({ route: null, error: "" }); return; }
    const controller = new AbortController();
    setState({ route: null, error: "" });
    fetch(base + "/api/kakao/route", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: pts.slice(0, 30) }), signal: controller.signal })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || "route"); return d; })
      .then((route) => setState({ route, error: "" }))
      .catch((e) => { if (e.name !== "AbortError") setState({ route: null, error: e.message }); });
    return () => controller.abort();
  }, [key, enabled]);
  return state;
}

export const minutes = (sec) => Math.max(1, Math.round((sec || 0) / 60));
export const km = (m) => ((m || 0) / 1000).toFixed(1);

/** Banner messages (\n = intended line break) after the Kakao OAuth redirect (?kakao=...). Removes the flag from the URL. */
export function takeKakaoStatus() {
  const params = new URLSearchParams(location.search);
  const status = params.get("kakao");
  if (!status) return "";
  params.delete("kakao");
  history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  return {
    joined_sent: "카카오로 가입했어요!\n카카오톡 '나와의 채팅'으로 가입 안내를 보냈어요.",
    joined: "카카오로 가입했어요!\n이제 계획을 카카오톡으로 보낼 수 있어요.",
    login: "카카오로\n로그인했어요.",
    cancel: "카카오 로그인을\n취소했어요.",
    error: "카카오 로그인에 실패했어요.\n잠시 후 다시 시도해 주세요.",
  }[status] || "";
}
