import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useLanguage, translate } from "./i18n.js";
import "leaflet/dist/leaflet.css";
import coordinates from "./routeCoordinates.json";
import { setChatContext } from "./chatContext.js";
import { KAKAO_JS_KEY, TRAFFIC_COLORS, TRAFFIC_LABELS, km, loadKakaoMaps, minutes, useKakaoConfig, useLiveRoute } from "./kakao.js";

const entrancePoints = new Set(["망상시계탑", "망상해변 송림", "한섬감성바닷길"]);

export function CourseMap({ stops }) {
  const { language } = useLanguage();
  const config = useKakaoConfig();
  const pins = stops.map((s, i) => ({ name: s.name, point: s.point || coordinates[s.name], number: i + 1 })).filter((s) => s.point);
  const { route, error } = useLiveRoute(pins.map((p) => p.point), !!config.route);
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const [focus, setFocus] = useState(null);  // selected leg index, or null for the whole route
  const routeKey = JSON.stringify(route?.legs || null);
  useEffect(() => setFocus(null), [routeKey]);
  // Hand the live route to 무암이's chat: per-leg time, distance and traffic mix (share of road points).
  useEffect(() => {
    if (!route) { setChatContext("route", null); return; }
    const legs = route.legs.map((leg, i) => {
      const mix = {};
      for (const s of route.segments.filter(s => s.leg === i)) mix[s.level] = (mix[s.level] || 0) + s.path.length;
      const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
      return { from: pins[i]?.name, to: pins[i + 1]?.name, minutes: minutes(leg.duration), km: Number(km(leg.distance)),
        traffic_share: Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, Math.round(100 * v / total) + "%"])) };
    }).filter(l => l.to);
    setChatContext("route", { checked_at_kst: new Date(route.checked_at * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }),
      total_minutes: minutes(route.duration), total_km: Number(km(route.distance)), source: "카카오모빌리티 실시간 교통", legs });
    return () => setChatContext("route", null);
  }, [routeKey]);  // eslint-disable-line react-hooks/exhaustive-deps
  const titled = pins.map((p) => ({ ...p, title: p.number + ". " + translate(p.name + (entrancePoints.has(p.name) ? " (입구 기준)" : ""), language) }));
  return <>
    {KAKAO_JS_KEY && !kakaoFailed
      ? <KakaoMap pins={titled} route={route} focus={focus} onFail={() => setKakaoFailed(true)} />
      : <LeafletMap pins={titled} route={route} focus={focus} />}
    <RouteSummary route={route} error={error} enabled={!!config.route} pins={titled} focus={focus} setFocus={setFocus} />
  </>;
}

function RouteSummary({ route, error, enabled, pins, focus, setFocus }) {
  if (!route) return <p className="hint">{enabled && error
    ? "실시간 경로를 불러오지 못해 방문 순서만 직선으로 표시했어요."
    : "번호는 목록과 같은 방문 순서예요. 점선은 주소·입구 위치 사이의 직선이고, 겹치는 번호는 옆으로 펼쳐 표시해요."}</p>;
  const at = new Date(route.checked_at * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
  return <div className="route-summary">
    <div className="route-total">
      <span className="route-car" aria-hidden="true">🚗</span>
      <div><strong>자동차 추천 경로 · 약 {minutes(route.duration)}분</strong>
        <small>{km(route.distance)}km · {at} 실시간 교통 반영 · 카카오모빌리티</small></div>
    </div>
    <ul className="traffic-legend" aria-label="도로 색 안내">
      {Object.entries(TRAFFIC_LABELS).map(([level, label]) =>
        <li key={level}><i style={{ background: TRAFFIC_COLORS[level] }} />{label}</li>)}
    </ul>
    <div className="route-legs-title">
      <span><RouteIcon /> 구간을 누르면 지도에 그 경로만 보여요</span>
      {focus !== null && <button type="button" className="legs-all" onClick={() => setFocus(null)}>전체 경로 보기</button>}
    </div>
    <ol className="route-legs">{route.legs.map((leg, i) => {
      const from = pins[i], to = pins[i + 1];
      if (!to) return null;
      const on = focus === i;
      return <li key={i} className={"route-leg" + (on ? " is-on" : "") + (focus !== null && !on ? " is-dim" : "")}>
        <button type="button" className="leg-select" aria-pressed={on} onClick={() => setFocus(on ? null : i)}
          aria-label={`${from.number}번 ${from.name}에서 ${to.number}번 ${to.name}까지 경로만 지도에 보기`}>
          <span className="leg-nums" aria-hidden="true"><i>{from.number}</i><em /><i>{to.number}</i></span>
          <span className="leg-names"><span>{from.name}</span><span>{to.name}</span></span>
          <span className="leg-meta"><b>{minutes(leg.duration)}분</b><small>{km(leg.distance)}km</small></span>
        </button>
        <a className="leg-open" href={kakaoRouteUrl(from, to)} target="_blank" rel="noreferrer"
          aria-label={`${from.name}에서 ${to.name}까지 카카오맵 길찾기 열기 (새 창)`}><RouteIcon />카카오맵</a>
      </li>;
    })}</ol>
    <p className="hint">도보·대중교통을 골랐어도 이 경로는 자동차 기준이에요. 실제 교통은 출발 직전 다시 확인하세요.</p>
  </div>;
}

// Kakao Map directions link: from/to filled in; on phones map.kakao.com hands off to the KakaoMap app.
// Names may not contain "," or "/" (they separate fields in the URL).
function kakaoRouteUrl(from, to) {
  const part = (p) => `${encodeURIComponent(p.name.replace(/[,/]/g, " ").trim())},${p.point[0]},${p.point[1]}`;
  return `https://map.kakao.com/link/from/${part(from)}/to/${part(to)}`;
}

function RouteIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
    <circle cx="5" cy="15" r="2.4" fill="currentColor" />
    <path d="M15 1.8a3.6 3.6 0 0 0-3.6 3.6c0 2.6 3.6 6 3.6 6s3.6-3.4 3.6-6A3.6 3.6 0 0 0 15 1.8Zm0 4.9a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" fill="currentColor" />
    <path d="M7 15h4.5a2.8 2.8 0 0 0 0-5.6H9.8a2.3 2.3 0 0 1 0-4.6h.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 2.6" />
  </svg>;
}

function LeafletMap({ pins, route, focus }) {
  const container = useRef(null);
  const key = JSON.stringify(pins) + JSON.stringify(route?.segments || null) + focus;
  useEffect(() => {
    if (!pins.length) return;
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const points = pins.map((s) => s.point);
    if (route?.segments?.length) {
      const shown = route.segments.filter((s) => focus === null || s.leg === focus);
      const wide = focus === null ? [9, 5] : [12, 7];  // a single leg is drawn bolder so traffic colours stand out
      for (const seg of shown) L.polyline(seg.path, { color: "#fff", weight: wide[0], opacity: .95 }).addTo(map);
      for (const seg of shown) L.polyline(seg.path, { color: TRAFFIC_COLORS[seg.level], weight: wide[1], opacity: 1 }).addTo(map);
      const ends = focus === null ? points : [points[focus], points[focus + 1]].filter(Boolean);
      map.fitBounds(L.latLngBounds(shown.flatMap((s) => s.path).concat(ends)), { padding: [36, 36], maxZoom: 17 });
    } else {
      L.polyline(points, { color: "#185d59", dashArray: "6 6" }).addTo(map);
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
    }
    const labels = L.layerGroup().addTo(map);
    function drawPins() {
      labels.clearLayers();
      const occupied = [];
      const size = map.getSize();
      pins.forEach(({ number, title }, i) => {
        const origin = map.latLngToContainerPoint(points[i]);
        let p = origin;
        // Separate overlapping labels while keeping the actual route anchored.
        for (let n = 1; n < 600 && occupied.some((other) => other.distanceTo(p) < 29); n++) {
          const r = 6 * Math.sqrt(n), angle = n * 2.4;
          p = L.point(Math.min(size.x - 16, Math.max(16, origin.x + r * Math.cos(angle))),
            Math.min(size.y - 16, Math.max(16, origin.y + r * Math.sin(angle))));
        }
        occupied.push(p);
        const labelPoint = map.containerPointToLatLng(p);
        if (origin.distanceTo(p) > 2) L.polyline([points[i], labelPoint], { color: "#456a65", weight: 1, interactive: false }).addTo(labels);
        const tooltip = document.createElement("span");
        tooltip.textContent = title;
        const dim = focus !== null && i !== focus && i !== focus + 1;
        L.marker(labelPoint, { title, icon: L.divIcon({ className: "course-pin" + (dim ? " is-dim" : ""), html: "<span>" + number + "</span>", iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .addTo(labels).bindTooltip(tooltip);
      });
    }
    drawPins();
    map.on("zoomend", drawPins);
    return () => map.remove();
  }, [key]);
  return <div className="course-map" ref={container} aria-label="방문 순서 지도" />;
}

function KakaoMap({ pins, route, focus, onFail }) {
  const container = useRef(null);
  const key = JSON.stringify(pins) + JSON.stringify(route?.segments || null) + focus;
  useEffect(() => {
    if (!pins.length) return;
    let cancelled = false;
    const drawn = [];
    loadKakaoMaps().then((kakao) => {
      if (cancelled) return;
      const { maps } = kakao;
      const ll = ([lat, lng]) => new maps.LatLng(lat, lng);
      const map = new maps.Map(container.current, { center: ll(pins[0].point), level: 5, scrollwheel: false });
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      const bounds = new maps.LatLngBounds();
      (focus === null ? pins : [pins[focus], pins[focus + 1]].filter(Boolean)).forEach((p) => bounds.extend(ll(p.point)));
      if (route?.segments?.length) {
        const shown = route.segments.filter((s) => focus === null || s.leg === focus);
        for (const [color, weight] of focus === null ? [["#ffffff", 9], [null, 5]] : [["#ffffff", 12], [null, 7]]) {
          for (const seg of shown) {
            seg.path.forEach((pt) => bounds.extend(ll(pt)));
            drawn.push(new maps.Polyline({ map, path: seg.path.map(ll), strokeWeight: weight,
              strokeColor: color || TRAFFIC_COLORS[seg.level], strokeOpacity: .95, strokeStyle: "solid" }));
          }
        }
      } else {
        drawn.push(new maps.Polyline({ map, path: pins.map((p) => ll(p.point)), strokeWeight: 3,
          strokeColor: "#185d59", strokeOpacity: .9, strokeStyle: "shortdash" }));
      }
      pins.forEach(({ number, title, point }, i) => {
        const el = document.createElement("div");
        el.className = "course-pin kakao-pin" + (focus !== null && i !== focus && i !== focus + 1 ? " is-dim" : "");
        el.title = title;
        el.innerHTML = "<span></span>";
        el.firstChild.textContent = String(number);
        drawn.push(new maps.CustomOverlay({ map, position: ll(point), content: el, yAnchor: .5, xAnchor: .5 }));
      });
      map.setBounds(bounds, 32, 32, 32, 32);
    }).catch(() => !cancelled && onFail());
    return () => { cancelled = true; drawn.forEach((o) => o.setMap(null)); if (container.current) container.current.innerHTML = ""; };
  }, [key]);
  return <div className="course-map kakao-map" ref={container} aria-label="방문 순서 카카오 지도" />;
}
