// Briefing card shown when "낚시" is selected: sea safety + 7-day analysis of the
// official KHOA fishing index for the sea next to Donghae (best days, best slot per species).
// Other cities' point names are never shown: the service is about Donghae.
import React from "react";
import { MapLink } from "./MapLink.jsx";
import { ActivityArt } from "./ActivityArt.jsx";

const LEVEL = { "매우좋음": "idx-best", "좋음": "idx-good", "보통": "idx-normal", "나쁨": "idx-bad", "매우나쁨": "idx-worst" };

function Index({ value }) {
  return value ? <span className={`spot-index ${LEVEL[value] || ""}`}>{value}</span> : null;
}

export function FishingPanel({ fishing, beachName }) {
  if (!fishing) return <section className="card fishing" role="status"><p>낚시 정보를 분석하고 있어요…</p></section>;
  const { safety, spots, spot_here: here, analysis: a } = fishing;
  return (
    <section className={`card fishing fish-${safety.level}`} aria-labelledby="fishing-title">
      <div className="fishing-head">
        <span className="fishing-icon" aria-hidden="true"><ActivityArt kind="fishing" /></span>
        <div>
          <h2 id="fishing-title">{beachName} 낚시 브리핑</h2>
          <p className="fishing-sub">{here ? `${here} · 낚시 명소예요` : "가까운 낚시 포인트를 모아봤어요"}{a ? " · 7일 낚시지수 분석" : ""}</p>
        </div>
        <div className="fishing-signal" role="note">
          <strong>{safety.label}</strong>
          <span>{safety.detail}</span>
        </div>
      </div>

      {a && <>
        <h3 className="fishing-h">📅 이번 주 언제 가면 좋을까</h3>
        <ul className="fish-week">{a.week.map((w) => (
          <li key={w.date} className={w.index ? LEVEL[w.index] : "idx-danger"} title={w.when || undefined}>
            <span className="fw-day">{w.label}</span>
            <span className="fw-index">{w.index || "바다 위험"}</span>
            <span className="fw-point">{w.index ? (w.when || "").replace(w.label, "").trim() || "종일" : "파도·바람"}</span>
          </li>))}</ul>

        <div className="fishing-cols">
          <div>
            <h3 className="fishing-h">🐟 어종별 베스트 타이밍</h3>
            <ul className="fish-species">{a.species.map((s) => (
              <li key={s.species}>
                <strong>{s.species}</strong>
                <span>{s.when}{s.sea === "caution" ? " · 파도·바람 주의" : ""}</span>
                <Index value={s.index} />
              </li>))}</ul>
          </div>
          <div>
            <h3 className="fishing-h">📍 {beachName} 근처 포인트</h3>
            {a.local_species.length > 0 && <p className="local-fish">
              이번 주 기대 어종 <b>{a.local_species.join(" · ")}</b>
              <small>동해 인근 해역 공식 낚시지수 '보통' 이상 기준
                {a.local_water_temp && ` · 수온 ${a.local_water_temp[0]}~${a.local_water_temp[1]}℃`}</small>
            </p>}
            <ul className="local-spots">{spots.map((s) => (
              <li key={s.id}><span><strong>{s.name}</strong> <small>{s.kind} · {s.distance_km}km</small></span>
                <MapLink href={s.map_url} name={s.name} /></li>))}</ul>
          </div>
        </div>
      </>}

      {!a && <div className="fishing-spots">
        <h3 className="fishing-h">근처 낚시 포인트</h3>
        <ul>{spots.map((s) => (
          <li key={s.id}>
            <div className="spot-top"><strong>{s.name}</strong><span className="spot-kind">{s.kind} · {s.distance_km}km</span><Index value={s.index} /></div>
            <p>{s.fish.length ? `잘 나오는 어종 · ${s.fish.join(", ")}` : "어종·낚시지수 정보 확인 불가"}</p>
            <MapLink href={s.map_url} name={s.name} />
          </li>))}</ul>
      </div>}

      <div className="fishing-cols fishing-foot">
        <div>
          <h3 className="fishing-h">🎣 낚시용품 · 대여</h3>
          <p className="hint">지도에서 영업 여부와 대여 가능 품목을 확인하세요.</p>
          <MapLink href={fishing.tackle_url} label={fishing.tackle_label} />
        </div>
        <div>
          <h3 className="fishing-h">⚠️ 낚시 전 꼭 지켜요</h3>
          <ol className="fishing-rules">{fishing.rules.map((r) => <li key={r}>{r}</li>)}</ol>
        </div>
      </div>
      <p className="hint fishing-source">{fishing.notice} 파고 2m·풍속 10m/s 이상 시간대는 좋은 시간으로 고르지 않아요. 동해 포인트 위치는 팀 검증 전 초안이에요.{a && ` 출처: ${fishing.source}`}</p>
    </section>
  );
}
