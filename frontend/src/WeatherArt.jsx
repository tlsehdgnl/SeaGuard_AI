// Animated East Sea scene for the briefing card. Pure SVG (no image assets),
// tinted to the app palette. Decorative: the card text carries the meaning.
import React from "react";

const SKY = {
  calm: ["#bfe3f2", "#fdeee0"],
  waves: ["#cfe6f1", "#eef5f8"],
  wind: ["#d5e3ec", "#f1f5f8"],
  rain: ["#9db2c2", "#cfd9e1"],
};
// Tileable swell: period 300 so a -600px shift loops seamlessly.
const swell = (y, a) =>
  `M0 ${y} Q75 ${y - a} 150 ${y} T300 ${y} T450 ${y} T600 ${y} T750 ${y} T900 ${y} T1050 ${y} T1200 ${y} V320 H0Z`;

export function WeatherArt({ scene = "calm" }) {
  const [top, bottom] = SKY[scene] || SKY.calm;
  const rough = scene === "waves" ? 1.9 : scene === "wind" ? 1.4 : scene === "rain" ? 1.2 : 1;
  const id = `wa-${scene}`;
  return (
    <svg className={`weather-art wa-${scene}`} viewBox="0 0 600 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id={`${id}-sea1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd0dc" /><stop offset="1" stopColor="#3aaebe" />
        </linearGradient>
        <linearGradient id={`${id}-sea2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a9fb3" /><stop offset="1" stopColor="#13788f" />
        </linearGradient>
        <linearGradient id={`${id}-sea3`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14607a" /><stop offset="1" stopColor="#0d3f57" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#fff4d6" /><stop offset=".55" stopColor="#ffc58f" /><stop offset="1" stopColor="#ff9b78" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="320" fill={`url(#${id}-sky)`} />

      {scene === "calm" && <g className="wa-sun"><circle cx="455" cy="150" r="90" fill={`url(#${id}-sun)`} /><circle cx="455" cy="150" r="34" fill="#ffd9a8" /></g>}
      {scene !== "calm" && (
        <g className="wa-clouds" fill={scene === "rain" ? "#7f95a6" : "#ffffff"} opacity={scene === "rain" ? .95 : .9}>
          <g className="wa-cloud c1"><ellipse cx="140" cy="70" rx="70" ry="26" /><ellipse cx="185" cy="58" rx="46" ry="30" /><ellipse cx="105" cy="62" rx="36" ry="22" /></g>
          <g className="wa-cloud c2"><ellipse cx="420" cy="92" rx="80" ry="24" /><ellipse cx="460" cy="76" rx="44" ry="28" /><ellipse cx="385" cy="82" rx="34" ry="20" /></g>
        </g>
      )}
      {scene === "wind" && (
        <g className="wa-gusts" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity=".85">
          <path d="M40 140 H250 q30 0 30 -22 q0 -18 -18 -18" />
          <path d="M120 175 H380 q26 0 26 18 q0 16 -16 16" />
          <path d="M300 125 H520" />
        </g>
      )}
      {scene === "rain" && (
        <g className="wa-rain" stroke="#e8f1f6" strokeWidth="3" strokeLinecap="round" opacity=".8">
          {Array.from({ length: 22 }, (_, i) => (
            <line key={i} x1={20 + i * 27} y1={110 + (i % 3) * 14} x2={12 + i * 27} y2={134 + (i % 3) * 14} />
          ))}
        </g>
      )}

      <g className="wa-sea">
        <path className="wa-swell s1" d={swell(196, 10 * rough)} fill={`url(#${id}-sea1)`} />
        <path className="wa-swell s2" d={swell(222, 14 * rough)} fill={`url(#${id}-sea2)`} />
        <path className="wa-swell s3" d={swell(256, 18 * rough)} fill={`url(#${id}-sea3)`} />
        {scene === "waves" && (
          <path className="wa-swell s2 foam" d={swell(222, 14 * rough).replace(/ V320 H0Z$/, "")} fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity=".9" />
        )}
      </g>
      {scene === "calm" && <g className="wa-glint" fill="#fff6e0" opacity=".85"><rect x="420" y="206" width="70" height="3" rx="1.5" /><rect x="436" y="216" width="40" height="3" rx="1.5" /><rect x="446" y="226" width="22" height="3" rx="1.5" /></g>}
    </svg>
  );
}
