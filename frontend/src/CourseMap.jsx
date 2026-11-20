import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useLanguage, translate } from "./i18n.js";
import "leaflet/dist/leaflet.css";
import coordinates from "./routeCoordinates.json";
import { KAKAO_JS_KEY, TRAFFIC_COLORS, TRAFFIC_LABELS, km, loadKakaoMaps, minutes, useKakaoConfig, useLiveRoute } from "./kakao.js";

const entrancePoints = new Set(["망상시계탑", "망상해변 송림", "한섬감성바닷길"]);

export function CourseMap({ stops }) {
  const { language } = useLanguage();
  const config = useKakaoConfig();
  const pins = stops.map((s, i) => ({ name: s.name, point: s.point || coordinates[s.name], number: i + 1 })).filter((s) => s.point);
  const { route, error } = useLiveRoute(pins.map((p) => p.point), !!config.route);
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const titled = pins.map((p) => ({ ...p, title: p.number + ". " + translate(p.name + (entrancePoints.has(p.name) ? " (입구 기준)" : ""), language) }));
  return <>
    {KAKAO_JS_KEY && !kakaoFailed
      ? <KakaoMap pins={titled} route={route} onFail={() => setKakaoFailed(true)} />
      : <LeafletMap pins={titled} route={route} />}
    <RouteSummary route={route} error={error} enabled={!!config.route} pins={titled} />
  </>;
}

function RouteSummary({ route, error, enabled, pins }) {
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
    <ol className="route-legs">{route.legs.map((leg, i) => pins[i + 1] && (
      <li key={i}><span>{pins[i].number} → {pins[i + 1].number}</span><b>{minutes(leg.duration)}분</b><small>{km(leg.distance)}km</small></li>))}
    </ol>
    <p className="hint">도보·대중교통을 골랐어도 이 경로는 자동차 기준이에요. 실제 교통은 출발 직전 다시 확인하세요.</p>
  </div>;
}

function LeafletMap({ pins, route }) {
  const container = useRef(null);
  const key = JSON.stringify(pins) + JSON.stringify(route?.segments || null);
  useEffect(() => {
    if (!pins.length) return;
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const points = pins.map((s) => s.point);
    if (route?.segments?.length) {
      for (const seg of route.segments) L.polyline(seg.path, { color: "#fff", weight: 9, opacity: .9 }).addTo(map);
      for (const seg of route.segments) L.polyline(seg.path, { color: TRAFFIC_COLORS[seg.level], weight: 5, opacity: .95 }).addTo(map);
      map.fitBounds(L.latLngBounds(route.segments.flatMap((s) => s.path).concat(points)), { padding: [32, 32], maxZoom: 16 });
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
        L.marker(labelPoint, { title, icon: L.divIcon({ className: "course-pin", html: "<span>" + number + "</span>", iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .addTo(labels).bindTooltip(tooltip);
      });
    }
    drawPins();
    map.on("zoomend", drawPins);
    return () => map.remove();
  }, [key]);
  return <div className="course-map" ref={container} aria-label="방문 순서 지도" />;
}

function KakaoMap({ pins, route, onFail }) {
  const container = useRef(null);
  const key = JSON.stringify(pins) + JSON.stringify(route?.segments || null);
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
      pins.forEach((p) => bounds.extend(ll(p.point)));
      if (route?.segments?.length) {
        for (const [color, weight] of [["#ffffff", 9], [null, 5]]) {
          for (const seg of route.segments) {
            seg.path.forEach((pt) => bounds.extend(ll(pt)));
            drawn.push(new maps.Polyline({ map, path: seg.path.map(ll), strokeWeight: weight,
              strokeColor: color || TRAFFIC_COLORS[seg.level], strokeOpacity: .95, strokeStyle: "solid" }));
          }
        }
      } else {
        drawn.push(new maps.Polyline({ map, path: pins.map((p) => ll(p.point)), strokeWeight: 3,
          strokeColor: "#185d59", strokeOpacity: .9, strokeStyle: "shortdash" }));
      }
      pins.forEach(({ number, title, point }) => {
        const el = document.createElement("div");
        el.className = "course-pin kakao-pin";
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
