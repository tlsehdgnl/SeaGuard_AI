import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  sanitizeProfile,
  initialProfile,
  shareUrl,
  readStorage,
  writeStorage,
  appendFeedback,
} from "../src/preferences.js";

test("shared conditions override saved settings and preserve demo label", () => {
  assert.equal(initialProfile("", null).mode, "forecast");
  const saved = { ...DEFAULTS, beach: "eodal", mode: "forecast" };
  const profile = {
    ...DEFAULTS,
    beach: "chuam",
    mode: "demo",
    children: true,
    mobility: "stroller",
    transport: "transit",
    budget: "free",
    time_budget: "60",
  };
  const url = new URL(
    shareUrl("https://example.com/?token=secret#old", profile),
  );
  assert.equal(url.search, "");
  assert.deepEqual(initialProfile(url.hash, saved), profile);
});
test("favorite is restored only when a shared beach is absent", () => {
  assert.equal(
    initialProfile("", { ...DEFAULTS, beach: "eodal" }).beach,
    "eodal",
  );
  assert.equal(
    initialProfile("#beach=chuam", { ...DEFAULTS, beach: "eodal" }).beach,
    "chuam",
  );
});
test("untrusted URL conditions cannot create invalid API inputs", () => {
  assert.deepEqual(
    sanitizeProfile({
      beach: "unknown",
      activity: "<script>",
      children: "false",
      time_budget: "-1",
      mode: "live",
    }),
    DEFAULTS,
  );
  assert.deepEqual(sanitizeProfile(null), DEFAULTS);
});
test("unavailable or corrupt storage never blocks the app", () => {
  assert.equal(readStorage(null, "key", "fallback"), "fallback");
  assert.equal(readStorage({ getItem: () => "{oops" }, "key", null), null);
  assert.equal(
    writeStorage(
      {
        setItem: () => {
          throw Error("denied");
        },
      },
      "key",
      {},
    ),
    false,
  );
});
test("feedback history is bounded and recoverable from corrupt storage", () => {
  const old = Array.from({ length: 40 }, (_, i) => ({
    place_id: String(i),
    reason: "cost",
  }));
  const next = appendFeedback(old, { place_id: "pencil", reason: "mobility" });
  assert.equal(next.length, 30);
  assert.equal(next.at(-1).place_id, "pencil");
  assert.equal(
    appendFeedback({}, { place_id: "pencil", reason: "cost" }).length,
    1,
  );
});
