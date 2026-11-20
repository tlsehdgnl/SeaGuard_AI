import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { useLanguage, translate } from "./i18n.js";
import "leaflet/dist/leaflet.css";
import coordinates from "./routeCoordinates.json";

const entrancePoints = new Set(["망상시계탑", "망상해변 송림", "한섬감성바닷길"]);

export function CourseMap({ names }) {
  const {language} = useLanguage();
  const container = useRef(null);
  const key = JSON.stringify(names);
  useEffect(() => {
    const stops = JSON.parse(key);
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const points = stops.map(name => coordinates[name]);
    L.polyline(points, {color:"#185d59", dashArray:"6 6"}).addTo(map);
    map.fitBounds(L.latLngBounds(points), {padding:[32,32], maxZoom:16});
    const labels = L.layerGroup().addTo(map);
    function drawPins() {
      labels.clearLayers();
      const occupied = [];
      const size = map.getSize();
      stops.forEach((name,i) => {
        const origin = map.latLngToContainerPoint(points[i]);
        let p = origin;
        // Separate overlapping labels while keeping the actual route anchored.
        for (let n = 1; n < 600 && occupied.some(other => other.distanceTo(p) < 29); n++) {
          const r = 6 * Math.sqrt(n);
          const angle = n * 2.4;
          p = L.point(Math.min(size.x-16, Math.max(16, origin.x+r*Math.cos(angle))),
                      Math.min(size.y-16, Math.max(16, origin.y+r*Math.sin(angle))));
        }
        occupied.push(p);
        const labelPoint = map.containerPointToLatLng(p);
        if (origin.distanceTo(p)>2)
          L.polyline([points[i],labelPoint], {color:"#456a65",weight:1,interactive:false}).addTo(labels);
        const title = (i+1)+". "+translate(name+(entrancePoints.has(name) ? " (입구 기준)" : ""), language);
        const tooltip = document.createElement("span");
        tooltip.textContent = title;
        L.marker(labelPoint, {title, icon:L.divIcon({className:"course-pin",
          html:"<span>"+(i+1)+"</span>", iconSize:[26,26], iconAnchor:[13,13]})}).addTo(labels).bindTooltip(tooltip);
      });
    }
    drawPins();
    map.on("zoomend", drawPins);
    return () => map.remove();
  }, [key, language]);
  return <><div className="course-map" ref={container} aria-label="방문 순서 지도" />
    <p className="hint">번호는 목록과 같은 방문 순서예요. 점선은 주소·입구 위치 사이의 직선이고, 겹치는 번호는 옆으로 펼쳐 표시해요.</p></>;
}
