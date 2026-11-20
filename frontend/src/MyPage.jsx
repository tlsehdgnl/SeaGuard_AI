import React, { useState } from "react";
import { destinationName } from "./beaches.js";
import { ACTIVITY_LABELS } from "./preferences.js";

export function MyPage({ plans, onOpen, onDelete, onBack, headingRef, message }) {
  const [confirm, setConfirm] = useState(null);
  return <section className="my-page">
    <div className="step-meta"><button onClick={onBack}>← 여행 계획으로</button></div>
    <h1 tabIndex={-1} ref={headingRef}>마이페이지</h1>
    <h2>저장한 계획 {plans.length}개</h2>
    <p className="hint">로그인 없이 이 브라우저에 저장돼요. 사이트 데이터를 지우거나 시크릿 창을 닫으면 저장한 계획이 사라질 수 있어요. 다른 기기에서는 계획을 열고 ‘공유 · QR’을 이용하세요.</p>
    {!plans.length && <p className="card">아직 저장한 계획이 없어요. 여행 계획의 마지막 화면에서 ‘조건 저장’을 눌러 보세요.</p>}
    <div className="saved-grid">{plans.map(({key, profile:p, updatedAt}) =>
      <article key={key} className="card saved-plan">
        <small>{updatedAt ? new Date(updatedAt).toLocaleString("ko-KR", {dateStyle:"medium",timeStyle:"short"})+" 저장" : "이전에 저장한 조건"}</small>
        <h3>{destinationName(p.beach)}</h3>
        <p>{p.activity.map(a => ACTIVITY_LABELS[a]).join(" · ")}</p>
        <p className="hint">{[p.mode === "demo" ? "예시 데이터" : "모델 예보", p.children && "어린이 동반",
          {stroller:"유모차 동반",step_free:"계단 없는 이동"}[p.mobility],
          {transit:"대중교통",car:"차량 이용"}[p.transport],p.budget === "free" && "무료 활동",
          p.time_budget !== "any" && p.time_budget+"분 이내"].filter(Boolean).join(" · ")}</p>
        {!!p.stops.length && <p>담은 장소 · {p.stops.join(" → ")}</p>}
        {confirm === key ? <div><p>이 계획을 삭제할까요?</p><div className="toolbar">
          <button onClick={() => setConfirm(null)}>취소</button>
          <button onClick={() => {onDelete(key); setConfirm(null);}}>삭제하기</button></div></div> :
          <div className="toolbar"><button onClick={() => onOpen(p)}>계획 열기</button>
          <button onClick={() => setConfirm(key)}>삭제</button></div>}
      </article>)}</div><p role="status">{message}</p>
  </section>;
}
