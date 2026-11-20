import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BEACHES, destinationName } from "../src/beaches.js";
import { shops, activities } from "../src/nearby.js";
import { PLACE_NAMES } from "../src/preferences.js";

test("every selectable or suggested course stop has a Donghae map point", () => {
  const points = JSON.parse(readFileSync(new URL("../src/routeCoordinates.json", import.meta.url), "utf8"));
  const names = [...BEACHES.map(b => destinationName(b.id)), ...Object.values(PLACE_NAMES),
    ...[shops, activities].flatMap(group => Object.values(group).flat().map(([name]) => name))];
  for (const name of names) {
    const [lat, lon] = points[name] || [];
    assert.ok(lat > 37.42 && lat < 37.62 && lon > 128.96 && lon < 129.19, name);
  }
});
