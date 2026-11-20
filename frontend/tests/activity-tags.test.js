import test from "node:test";
import assert from "node:assert/strict";
import { activityTag, rankAlternatives, lostActivities } from "../src/activityTags.js";

const seaPath = { name: "한섬감성바닷길", detail: "해안 산책로 걷기" };
const cave = { name: "천곡황금박쥐동굴", detail: "동해시 동굴로 50" };
const beachWalk = { name: "망상해변", detail: "백사장 따라 걷기" };
const lunch = { name: "피아노", detail: "파스타", meal: true };

test("stops are tagged by the activity they give", () => {
  assert.equal(activityTag(seaPath), "outdoor");
  assert.equal(activityTag(cave), "indoor");
  assert.equal(activityTag(lunch), "food");
  assert.equal(activityTag({ name: "빙스퐁", detail: "커피·디저트" }), "cafe");
});

test("replacing a sea path suggests outdoor places before the cave", () => {
  const { tag, same, other } = rankAlternatives(seaPath, [cave, beachWalk]);
  assert.equal(tag, "outdoor");
  assert.deepEqual(same.map((p) => p.name), ["망상해변"]);
  assert.deepEqual(other.map((p) => p.name), ["천곡황금박쥐동굴"]);
});

test("swapping the walk for the cave reports the lost walk", () => {
  assert.deepEqual(lostActivities(["walk", "food"], [cave, lunch]), ["walk"]);
  assert.deepEqual(lostActivities(["walk", "food"], [beachWalk, lunch]), []);
});

test("cafes named after a beach are cafes, not walks", () => {
  assert.equal(activityTag({ name: "메가엠지씨커피 동해망상해변점", detail: "망상 · 커피 · 동해대로" }), "cafe");
  assert.equal(activityTag({ name: "노봉해변", detail: "조용한 해안 풍경 사진 찍기" }), "outdoor");
});
