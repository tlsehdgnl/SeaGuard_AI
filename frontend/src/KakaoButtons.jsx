// Kakao login button, "send summary to my KakaoTalk" button, and the post-login toast.
import React, { useEffect, useState } from "react";
import { kakaoConfig, takeKakaoStatus, useKakaoConfig } from "./kakao.js";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const loginHref = base + "/api/kakao/login";

const Bubble = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12 3.5c-5 0-9 3.1-9 7 0 2.5 1.7 4.7 4.2 5.9l-.9 3.4c-.1.3.3.6.6.4l4-2.6h1.1c5 0 9-3.1 9-7s-4-7.1-9-7.1Z" />
  </svg>
);

/** Kakao login (Kakao design guide: #FEE500 background, black 85% label). Hidden until configured. */
export function KakaoLoginButton({ label = "카카오로 3초 만에 시작하기" }) {
  const config = useKakaoConfig();
  if (!config.login) return null;
  return <a className="kakao-login" href={loginHref}><Bubble />{label}</a>;
}

/** Sends the plan summary to the user's own KakaoTalk ("나와의 채팅"). */
export function KakaoSendButton({ build }) {
  const config = useKakaoConfig();
  const [state, setState] = useState("idle");
  const [note, setNote] = useState("");
  if (!config.login && !config.connected) return null;
  async function send() {
    if (!config.connected) { window.location.assign(loginHref); return; }
    setState("sending"); setNote("");
    try {
      const r = await fetch(base + "/api/kakao/memo", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(build()) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "카카오톡으로 보내지 못했어요.");
      setState("sent"); setNote("카카오톡 '나와의 채팅'에 계획 요약을 보냈어요.");
    } catch (e) {
      setState("error"); setNote(e.message);
      kakaoConfig(true);
    }
  }
  return <div className={"kakao-send is-" + state}>
    <button type="button" onClick={send} disabled={state === "sending"}>
      <span className="kakao-send-icon" aria-hidden="true"><Bubble /></span>
      <span className="kakao-send-text">
        <strong>{state === "sent" ? "카카오톡으로 보냈어요" : "카카오톡으로 요약 받기"}</strong>
        <small>{config.connected ? "코스·날씨·계획 링크를 나와의 채팅에 저장해요" : "카카오 로그인 후 바로 보내 드려요"}</small>
      </span>
      <span className="kakao-send-state" aria-hidden="true">{state === "sending" ? "…" : state === "sent" ? "✓" : "→"}</span>
    </button>
    {note && <p role="status">{note}</p>}
  </div>;
}

/** One-time toast after returning from Kakao login. */
export function KakaoToast() {
  const [text, setText] = useState("");
  useEffect(() => {
    const message = takeKakaoStatus();
    if (!message) return;
    setText(message);
    const timer = setTimeout(() => setText(""), 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!text) return null;
  return <div className="kakao-toast" role="status"><span aria-hidden="true"><Bubble /></span>{text}
    <button type="button" aria-label="알림 닫기" onClick={() => setText("")}>×</button></div>;
}
