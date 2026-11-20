// 7-day visit date chips (today … +6). Replaces the native date input, whose
// calendar popup is slow for a one-week window and does not match the app style.
import React from "react";
import { tripDate } from "./CoursePlanner.jsx";
import { useLanguage } from "./i18n.js";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayPicker({ value, onChange, label = "방문일", hint }) {
  const { language } = useLanguage();
  const en = language === "en";
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = tripDate(i);
    const [, m, d] = iso.split("-").map(Number);
    const wd = new Date(`${iso}T12:00:00+09:00`).getUTCDay();
    return { iso, m, d, wd, tag: i === 0 ? (en ? "Today" : "오늘") : i === 1 ? (en ? "Tmrw" : "내일") : (en ? WEEKDAY_EN : WEEKDAY)[wd] };
  });
  return (
    <div className="day-picker">
      <div className="day-picker-head">
        <span className="day-picker-label" id="day-picker-label">{label}</span>
        {hint && <span className="day-picker-hint">{hint}</span>}
      </div>
      <div className="day-chips" role="radiogroup" aria-labelledby="day-picker-label">
        {days.map((day) => {
          const on = day.iso === value;
          return (
            <button key={day.iso} type="button" role="radio" aria-checked={on}
              aria-label={`${day.m}월 ${day.d}일 ${WEEKDAY[day.wd]}요일`}
              className={`day-chip${on ? " is-on" : ""}${day.wd === 0 ? " is-sun" : day.wd === 6 ? " is-sat" : ""}`}
              onClick={() => onChange(day.iso)}>
              <span className="dc-tag" lang={en ? "en" : "ko"}>{day.tag}</span>
              <span className="dc-day">{day.d}</span>
              <span className="dc-month">{en ? `${day.m}/${day.d}` : `${day.m}월`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
