// Activity postcard illustrations (SVG, app palette). Decorative only.
import React from "react";

const INK = "#1d3a52";
const SEA = "#2aa3b3";
const DAWN = "#ff9b78";
const SAND = "#f4d9b0";
const line = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
const sea = (y) => <path d={`M0 ${y} Q15 ${y - 4} 30 ${y} T60 ${y} T90 ${y} T120 ${y} V60 H0Z`} fill={SEA} opacity=".22" />;

const ART = {
  walk: <>
    <rect y="38" width="120" height="22" fill={SAND} opacity=".55" />
    {sea(40)}
    {[[38, 46], [54, 36], [70, 44], [86, 34]].map(([x, y], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${i % 2 ? 12 : -12})`} fill="#c9a77a">
        <path d="M0 -4c2.6 0 3.6 2.4 3.4 5.2-.2 3-1.6 5.6-3.6 5.6S-3.6 4-3.6 1C-3.6-2 -2.4-4 0-4Z" />
        <circle cx="-2.6" cy="-7" r="1.1" /><circle cx="-.6" cy="-7.8" r="1.2" /><circle cx="1.6" cy="-7.4" r="1.1" /><circle cx="3.2" cy="-6.2" r="1" />
      </g>
    ))}
    <path d="M20 22 q6 -4 12 0 t12 0" {...line} stroke={SEA} opacity=".7" />
    <circle cx="96" cy="16" r="6" fill={DAWN} opacity=".85" />
  </>,
  swim: <>
    {sea(36)}
    <circle cx="60" cy="30" r="15" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="60" cy="30" r="7" fill="#eaf6f8" stroke={INK} strokeWidth="2" />
    <g fill={DAWN}><path d="M60 15a15 15 0 0 1 10.6 4.4l-5 5A8 8 0 0 0 60 22Z" /><path d="M75 30a15 15 0 0 1-4.4 10.6l-5-5A8 8 0 0 0 68 30Z" />
      <path d="M60 45a15 15 0 0 1-10.6-4.4l5-5A8 8 0 0 0 60 38Z" /><path d="M45 30a15 15 0 0 1 4.4-10.6l5 5A8 8 0 0 0 52 30Z" /></g>
    <path d="M30 46 q8 -5 16 0 t16 0 t16 0 t16 0" {...line} stroke={SEA} />
  </>,
  photo: <>
    {sea(48)}
    <rect x="38" y="16" width="44" height="30" rx="7" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <rect x="48" y="11" width="14" height="7" rx="2.5" fill={INK} />
    <circle cx="60" cy="31" r="9" fill="#dff2f5" stroke={INK} strokeWidth="2.4" /><circle cx="63" cy="28" r="2.2" fill="#fff" />
    <circle cx="75" cy="21" r="2" fill={DAWN} />
    <g {...line} stroke={DAWN}><path d="M88 14l5-4" /><path d="M90 22h6" /></g>
  </>,
  sunrise: <>
    <circle cx="60" cy="40" r="15" fill={DAWN} />
    <g {...line} stroke={DAWN}><path d="M60 14v-6" /><path d="M42 21l-4-4" /><path d="M78 21l4-4" /><path d="M35 33h-6" /><path d="M85 33h6" /></g>
    <path d="M0 40 Q15 36 30 40 T60 40 T90 40 T120 40 V60 H0Z" fill={SEA} opacity=".5" />
    <path d="M0 48 Q15 44 30 48 T60 48 T90 48 T120 48 V60 H0Z" fill={SEA} opacity=".35" />
  </>,
  picnic: <>
    <rect y="44" width="120" height="16" fill="#cfe9d9" opacity=".7" />
    <path d="M38 28h44l-5 20H43Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M45 28c0-12 30-12 30 0" {...line} />
    <g stroke={DAWN} strokeWidth="2"><path d="M44 35h32M45 41h30M52 28v20M60 28v20M68 28v20" /></g>
  </>,
  cafe: <>
    <ellipse cx="58" cy="49" rx="24" ry="4.5" fill={SAND} opacity=".8" />
    <path d="M42 26h30v10a15 15 0 0 1-30 0Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M72 29h4a5 5 0 0 1 0 10h-4.6" {...line} />
    <path d="M45 30h24" stroke={DAWN} strokeWidth="5" opacity=".5" />
    <g {...line} stroke={SEA}><path d="M50 20c-3-3 3-6 0-9" /><path d="M58 20c-3-3 3-6 0-9" /><path d="M66 20c-3-3 3-6 0-9" /></g>
  </>,
  food: <>
    <path d="M36 32h48a24 18 0 0 1-48 0Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M40 34 q5 4 10 0 t10 0 t10 0 t10 0" {...line} stroke={DAWN} />
    <g {...line}><path d="M62 30 88 10" /><path d="M68 30 92 14" /></g>
    <ellipse cx="60" cy="50" rx="14" ry="2.5" fill={INK} opacity=".18" />
  </>,
  cleanup: <>
    <rect y="44" width="120" height="16" fill={SAND} opacity=".55" />
    <path d="M62 22c-2-6 14-6 12 0l6 24H56Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M64 33l4 4 7-8" {...line} stroke={SEA} />
    <g {...line}><path d="M34 14l14 30" /><path d="M42 14l10 30" /></g>
    <circle cx="90" cy="44" r="3" fill={DAWN} /><rect x="24" y="40" width="7" height="5" rx="1.5" fill={DAWN} opacity=".8" />
  </>,
  fishing: <>
    {sea(40)}
    <g {...line}><path d="M22 52 L70 8" /><path d="M70 8 Q86 4 90 30" strokeWidth="1.4" /></g>
    <circle cx="28" cy="46" r="3.5" fill="#fff" stroke={INK} strokeWidth="2" />
    <circle cx="90" cy="31" r="2.6" fill={DAWN} />
    <g transform="translate(78 44)"><path d="M0 0c6-6 16-6 20 0-4 6-14 6-20 0Z" fill={DAWN} /><path d="M20 0l6-4v8Z" fill={DAWN} /><circle cx="5" cy="-1" r="1.2" fill={INK} /></g>
  </>,
};

export function ActivityArt({ kind }) {
  return (
    <svg className="activity-art" viewBox="0 0 120 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {ART[kind] || null}
    </svg>
  );
}
