import React, { useEffect, useState } from 'react';

const SCENE_MS = 1400;

export default function DayPreview({ beach, stops, onPreview }) {
  const [index, setIndex] = useState(null);
  const [paused, setPaused] = useState(false);
  const stop = stops[index];

  useEffect(() => {
    if (index === null || paused) return;
    const timer = setTimeout(() => setIndex(index + 1 < stops.length ? index + 1 : null), SCENE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, stops.length]);

  return <section className="day-preview" aria-label="주변 코스 미리보기">
    <h2>{beach}해변 주변 코스</h2>
    <p>예시 일정 · {stops.map(item => item.name).join(' → ')}</p>
    {stop && <figure key={stop.image} aria-live="polite">
      <img src={stop.image} alt={stop.name}/>
      <figcaption><small>{index + 1} / {stops.length}</small><strong>{stop.name}</strong>
        {stop.detail} · <a href={stop.source} target="_blank" rel="noreferrer">사진 출처 ↗</a>
      </figcaption>
    </figure>}
    <button type="button" onClick={() => {
      if (stop) setPaused(!paused);
      else { onPreview(); setPaused(false); setIndex(0); }
    }}>{stop ? (paused ? '계속 보기' : '잠시 멈춤') : '▷ 하루 미리보기'}</button>
    {stop && <button type="button" onClick={() => setIndex(null)}>미리보기 닫기</button>}
  </section>;
}
