const base = import.meta.env.VITE_API_BASE_URL || "";
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
