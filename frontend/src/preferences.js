import { BEACHES } from "./beaches.js";

import { shops } from "./nearby.js";
export const PLACE_NAMES = {
  balhan: "발한도서관",
  buksam: "북삼도서관",
  dream: "꿈빛마루도서관",
  pencil: "연필뮤지엄",
  cave: "천곡황금박쥐동굴",
  forest: "동해무릉건강숲 실내 체험",
};
const shopNames = new Set([...Object.values(PLACE_NAMES), ...Object.values(shops).flat().map(([name]) => name)]);

export const ACTIVITY_LABELS = {
  walk: "산책", swim: "물놀이", photo: "풍경 사진",
  sunrise: "일출 감상", picnic: "피크닉", cafe: "카페 탐방",
  food: "맛집 탐방", cleanup: "해변 쓰레기 줍기", fishing: "낚시",
};

export const TIME_OPTIONS = [
  ["any", "시간 제한 없음"],
  ["30", "30분 이내"],
  ["60", "1시간 이내"],
  ["90", "1시간 30분 이내"],
  ["120", "2시간 이내"],
  ["180", "3시간 이내"],
  ["240", "4시간 이내"],
];
export const DEFAULTS = Object.freeze({
  beach: "mangsang",
  mode: "forecast",
  activity: ["walk"],
  stops: [],
  children: false,
  mobility: "any",
  transport: "any",
  budget: "any",
  time_budget: "any",
});
export const CHOICES = {
  beach: BEACHES.map(item => item.id),
  mode: ["demo", "forecast"],
  activity: Object.keys(ACTIVITY_LABELS),
  mobility: ["any", "stroller", "step_free"],
  transport: ["any", "car", "transit"],
  budget: ["any", "free"],
  time_budget: TIME_OPTIONS.map(([value]) => value),
};
export const STORAGE_KEY = "seaguard:favorite:v1";
export const FEEDBACK_KEY = "seaguard:feedback:v1";
export function sanitizeProfile(value) {
  const result = { ...DEFAULTS };
  if (!value || typeof value !== "object") return result;
  for (const [key, options] of Object.entries(CHOICES))
    if (key !== "activity" && options.includes(value[key])) result[key] = value[key];
  const raw = Array.isArray(value.activity) ? value.activity : String(value.activity ?? "").split(",");
  const selected = [...new Set(raw.filter(key => CHOICES.activity.includes(key)))];
  if (selected.length) result.activity = selected;
  const stops = Array.isArray(value.stops) ? value.stops : String(value.stops ?? "").split("|");
  result.stops = [...new Set(stops.filter(name => shopNames.has(name)))];
  if (typeof value.visit_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.visit_date)) result.visit_date = value.visit_date;
  let catalog = value.catalog;
  if (typeof catalog === "string") {
    try { catalog = JSON.parse(catalog); } catch { catalog = []; }
  }
  if (Array.isArray(catalog) && catalog.length) result.catalog = catalog.slice(0, 60)
    .filter(p => p && typeof p.id === "string" && typeof p.name === "string" && p.name.length <= 100)
    .map(({id,name,kind,latitude,longitude}) => ({id,name,kind,latitude,longitude}));
  result.children = value.children === true || value.children === "true";
  return result;
}
export function readStorage(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function initialProfile(hash, saved) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has("beach")
    ? sanitizeProfile(Object.fromEntries(params))
    : sanitizeProfile(saved);
}
export function profileParams(profile) {
  return new URLSearchParams(
    Object.entries(sanitizeProfile(profile)).map(([key, value]) => [
      key,
      key === "catalog" ? JSON.stringify(value) : key === "stops" ? value.join("|") : String(value),
    ]),
  );
}
export function shareUrl(base, profile) {
  const url = new URL(base);
  url.search = "";
  url.hash = profileParams(profile).toString();
  return url.toString();
}
export function appendFeedback(history, entry) {
  const safe = Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            typeof item.place_id === "string" &&
            typeof item.reason === "string",
        )
        .slice(-29)
    : [];
  return [...safe, entry];
}
