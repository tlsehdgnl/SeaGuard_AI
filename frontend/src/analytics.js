import { shops, activities } from "./nearby.js";
import { PLACE_NAMES } from "./preferences.js";
import { BEACHES, destinationName } from "./beaches.js";
const placeNames = new Set([
  ...Object.values(PLACE_NAMES), ...Object.values(shops).flat().map(row => row[0]),
  ...Object.values(activities).flat().map(row => row[0]), ...BEACHES.map(b => destinationName(b.id)),
]);
const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export function track(kind, beach, poi_id = "", demo = true, context) {
  try {
    const session_id = sessionStorage.getItem("seaguard.session") || crypto.randomUUID();
    sessionStorage.setItem("seaguard.session", session_id);
    fetch(base + "/api/events", {
      method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), session_id, kind, beach, poi_id, demo, context })
    }).catch(() => {});
  } catch { /* The itinerary remains usable when browser storage is unavailable. */ }
}

// Read only public catalogue labels; never transmit link queries or user text.
export function trackLink(event, profile) {
  const link = event.target.closest?.("a[href]");
  if (!link || link.target !== "_blank") return;
  const url = new URL(link.href);
  const kind = /^(map\.naver\.com|map\.kakao\.com)$/.test(url.hostname) ? "map_click" : "official_click";
  if (kind === "official_click" && !/(^|\.)(dh\.go\.kr|donghaelib\.go\.kr|weather\.go\.kr|kma\.go\.kr)$/.test(url.hostname) && !link.closest(".place")) return;
  const card = link.closest("article, li");
  const labels = [link.closest("[data-place-name]")?.dataset.placeName, link.textContent, card?.querySelector("h3, h4, .route-toggle, strong")?.textContent];
  const name = labels.map(text => text?.replace(/[↗→]/g, "").trim()).find(text => placeNames.has(text));
  track(kind, profile.beach, name ? "sdh:" + name : "", profile.mode === "demo");
}
