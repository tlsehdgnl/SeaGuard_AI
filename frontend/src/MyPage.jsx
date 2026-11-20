import { useAccount } from "./Account.jsx";
import React, { useState } from "react";
import { destinationName } from "./beaches.js";
import { useLanguage } from "./i18n.js";
import { ACTIVITY_LABELS } from "./preferences.js";

export function MyPage({ plans, localPlans=[], onOpen, onDelete, onBack, headingRef, message }) {
  const account=useAccount();
  const [busy,setBusy]=useState(false),[accountMessage,setAccountMessage]=useState("");
  async function importLocal(){setBusy(true);setAccountMessage("");try{for(let i=0;i<localPlans.length;i+=100)await account.saveCloud(localPlans.slice(i,i+100).map(p=>p.profile));setAccountMessage(language==="en"?"Device plans copied to your account. Local originals remain.":"이 기기의 기록을 계정에 복사했어요. 기기 원본은 유지됩니다.");}catch(error){setAccountMessage(error.message);}finally{setBusy(false);}}
  const {language} = useLanguage();
  const [confirm, setConfirm] = useState(null);
  return <section className="my-page">
    <div className="step-meta"><button onClick={onBack}>← 여행 계획으로</button></div>
    <h1 tabIndex={-1} ref={headingRef}>마이페이지</h1>
    <h2>저장한 계획 {plans.length}개</h2>
    <div className="account-summary">
      {account.user ? <><strong>{account.user.nickname}{language==="en" ? " · Account storage" : "님 · 계정 저장소"}</strong><p>{language==="en"?"Plans saved while signed in are available on your other devices. Device-only plans are copied only when you choose Import.":"로그인해서 저장한 계획은 다른 기기에서도 볼 수 있어요. 비회원 기록은 아래 버튼으로 가져올 때만 계정에 복사됩니다."}</p><div className="toolbar"><button disabled={busy||account.plansLoading} onClick={account.refreshPlans}>{language==="en"?"Sync again":"다시 동기화"}</button>{localPlans.length>0&&<button disabled={busy} onClick={importLocal}>{language==="en"?`Import ${localPlans.length} device plans`:`이 기기 기록 ${localPlans.length}개 가져오기`}</button>}<button disabled={busy} onClick={async()=>{setBusy(true);try{await account.logout();setAccountMessage("");}catch(error){setAccountMessage(error.message);}finally{setBusy(false);}}}>{language==="en"?"Sign out":"로그아웃"}</button></div></> : <><strong>{language==="en"?"Device-only storage":"이 기기에만 저장 중"}</strong><p>{language==="en"?"No account is required. Clearing browser data can remove these plans. Sign in to keep plans across devices.":"로그인 없이 이 브라우저에 저장돼요. 사이트 데이터를 지우면 기록이 사라질 수 있어요. 로그인하면 여러 기기의 기록을 모아 볼 수 있어요."}</p><a href="/login">{language==="en"?"Sign in / Create account →":"로그인 / 회원가입 →"}</a></>}
      {(account.error||account.plansError||accountMessage)&&<p className="account-status" role="status">{account.error||account.plansError||accountMessage}</p>}
      {account.plansLoading&&<p role="status">{language==="en"?"Loading account plans…":"계정 기록을 불러오고 있어요…"}</p>}
    </div>
    {!plans.length && <p className="card">아직 저장한 계획이 없어요. 여행 계획의 마지막 화면에서 ‘조건 저장’을 눌러 보세요.</p>}
    <div className="saved-grid">{plans.map(({key, profile:p, updatedAt}) =>
      <article key={key} className="card saved-plan">
        <small>{updatedAt ? new Date(updatedAt).toLocaleString(language === "en" ? "en-US" : "ko-KR", {dateStyle:"medium",timeStyle:"short"})+" 저장" : "이전에 저장한 조건"}</small>
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
