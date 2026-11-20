// Small pill links that replace bare "검색 ↗" hyperlinks.
import React from "react";

const Pin = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M8 1.2a5 5 0 0 0-5 5c0 3.6 5 8.6 5 8.6s5-5 5-8.6a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor" />
  </svg>
);
const Phone = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
    <path d="M4.2 1.5 6 4.1c.3.5.2 1.1-.2 1.5l-.9.8a8.6 8.6 0 0 0 4.7 4.7l.8-.9c.4-.4 1-.5 1.5-.2l2.6 1.8c.5.3.6 1 .3 1.5l-.7 1c-.6.8-1.6 1.2-2.6.9A12.6 12.6 0 0 1 1 6.4c-.3-1 .1-2 .9-2.6l1-.7c.5-.3 1.1-.2 1.3.4Z" fill="currentColor" />
  </svg>
);
const Out = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Naver Map search pill. `label` defaults to "네이버 지도". */
export function MapLink({ href, label = "네이버 지도", name }) {
  return (
    <a className="pill-link pill-map" href={href} target="_blank" rel="noreferrer"
      aria-label={name ? `${name} 네이버 지도에서 보기 (새 창)` : undefined}>
      <Pin />{label}
    </a>
  );
}
export function PhoneLink({ phone }) {
  return <a className="pill-link pill-phone" href={`tel:${phone}`}><Phone />전화 문의</a>;
}
/** Generic external pill (official sites, full schedules). */
export function OutLink({ href, children }) {
  return <a className="pill-link" href={href} target="_blank" rel="noreferrer">{children}<Out /></a>;
}
