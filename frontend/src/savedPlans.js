import { STORAGE_KEY, readStorage, sanitizeProfile } from "./preferences.js";

export const PLAN_PREFIX = "seaguard:plan:v1:";

function entry(key, raw, updatedAt) {
  return raw && typeof raw.beach === "string"
    ? { key, profile: sanitizeProfile(raw), updatedAt }
    : null;
}

export function listPlans(store) {
  const plans = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(PLAN_PREFIX)) continue;
      const value = readStorage(store, key, null);
      const plan = entry(key, value?.profile, value?.updatedAt);
      if (plan) plans.push(plan);
    }
    const legacy = entry(STORAGE_KEY, readStorage(store, STORAGE_KEY, null), null);
    if (legacy) plans.push(legacy);
  } catch { /* Private browsing may disable storage. */ }
  return plans.sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function savePlan(store, current) {
  const profile = sanitizeProfile(current);
  const key = PLAN_PREFIX + JSON.stringify(profile);
  store.setItem(key, JSON.stringify({ profile, updatedAt: new Date().toISOString() }));
  const legacy = readStorage(store, STORAGE_KEY, null);
  if (legacy && JSON.stringify(sanitizeProfile(legacy)) === JSON.stringify(profile))
    store.removeItem(STORAGE_KEY);
}
