// What kind of activity a stop gives the traveller, so swapping a place can keep it.
export const TAG_LABELS = { outdoor: "야외 걷기·풍경", indoor: "실내 관람", food: "식사", cafe: "카페", other: "기타" };

// Activities chosen in step 2 -> the stop tag that satisfies them.
const WANTS = { walk: "outdoor", photo: "outdoor", sunrise: "outdoor", picnic: "outdoor", cleanup: "outdoor",
  fishing: "outdoor", swim: "outdoor", food: "food", cafe: "cafe" };

const INDOOR = /도서관|박물관|뮤지엄|미술관|전시|동굴|체험관|실내|센터|facilities/;
const OUTDOOR = /산책|걷|길|둘레|바닷|해안|해변|백사장|전망|등대|공원|숲|정원|풍경|일출|사진|캠핑|항구|항$|attractions/;
const CAFE = /카페|커피|간식|베이커리|디저트|cafe|coffee/i;
// Shore places: never suggested while the sea visit is excluded for safety (특보·통제).
export const SEASIDE = /해변|해수욕장|바닷|해안|갯바위|방파제|등대|항$|항구/;

export function activityTag(stop) {
  if (stop.meal) return "food";
  const text = `${stop.name} ${stop.detail || ""} ${stop.kind || ""}`;
  if (CAFE.test(`${stop.detail || ""} ${stop.kind || ""}`) || /카페|커피/.test(stop.name)) return "cafe";
  if (stop.coastal) return "outdoor";
  if (INDOOR.test(text)) return "indoor";
  if (OUTDOOR.test(text)) return "outdoor";
  return "other";
}

/** Replacement choices for a stop that did not fit: same activity first, then the rest. */
export function rankAlternatives(missed, pool) {
  const tag = activityTag(missed);
  const rows = pool.map((p) => ({ ...p, tag: activityTag(p), keeps: activityTag(p) === tag }));
  return { tag, same: rows.filter((r) => r.keeps), other: rows.filter((r) => !r.keeps) };
}

/** Chosen activities (step 2) that no scheduled stop covers any more. */
export function lostActivities(activityKeys, scheduledStops) {
  const have = new Set(scheduledStops.map(activityTag));
  return activityKeys.filter((key) => WANTS[key] && !have.has(WANTS[key]));
}

export function wantedTag(activityKey) { return WANTS[activityKey]; }
