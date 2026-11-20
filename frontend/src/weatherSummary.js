// Rain is an accumulation over the provider's interval. Describe its presence,
// without comparing a 15-minute total with an hourly rainfall threshold.
export function weatherSummary({ wave_height: wave, wind_speed: wind, precipitation: rain }) {
  const conditions = [];
  if (wave >= 1) conditions.push({
    scene: "waves", title: wave >= 2 ? "높은 파도가 예상돼요" : "파도가 조금 있는 편이에요",
  });
  if (wind >= 6) conditions.push({
    scene: "wind", title: wind >= 10 ? "바람이 강하게 불겠어요" : "바람이 제법 불겠어요",
  });
  if (rain > 0) conditions.push({ scene: "rain", title: "비 소식이 있어요" });
  if (!conditions.length) return {
    scene: "calm", title: "비 소식 없이 바다가 잔잔해요", detail: "바람이 약하고 파도가 낮은 편이에요.",
  };
  const [first, ...rest] = conditions;
  return { ...first, detail: rest.length ? rest.map(item => item.title + ".").join(" ") :
    ({ waves: "시간대별 파고를 비교해 보세요.", wind: "시간대별 풍속을 비교해 보세요.", rain: "외출할 때 우산이나 우비를 챙겨 보세요." })[first.scene] };
}
