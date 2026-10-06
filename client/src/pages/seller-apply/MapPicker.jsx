import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import styles from "./map.module.css";

const KENYA = [0.0236, 37.9062];
const STEP = 0.0001;

const pin = L.divIcon({
  className: styles.pin,
  html: '<svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0z" fill="#38B6FF" stroke="#111111" stroke-width="2"/><circle cx="12" cy="11.5" r="4.5" fill="#111111"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 40]
});

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Follow({ value }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
  }, [value?.lat, value?.lng]);
  return null;
}

export default function MapPicker({ value, onChange }) {
  const wrap = useRef(null);
  const has = value && Number.isFinite(value.lat) && Number.isFinite(value.lng);

  const pick = (lat, lng) => onChange({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });

  const onKeyDown = (e) => {
    const delta = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const step = e.shiftKey ? STEP * 10 : STEP;
    const base = has ? value : { lat: KENYA[0], lng: KENYA[1] };
    pick(base.lat + delta[0] * step, base.lng + delta[1] * step);
  };

  return (
    <div
      ref={wrap}
      className={styles.wrap}
      tabIndex={0}
      role="application"
      aria-label="Map. Press the arrow keys to move the pin, hold Shift to move faster."
      onKeyDown={onKeyDown}
    >
      <MapContainer
        center={has ? [value.lat, value.lng] : KENYA}
        zoom={has ? 16 : 6}
        keyboard={false}
        className={styles.map}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />
        <Clicks onPick={pick} />
        <Follow value={has ? value : null} />
        {has && (
          <Marker
            position={[value.lat, value.lng]}
            icon={pin}
            draggable
            keyboard={false}
            eventHandlers={{
              dragend: (e) => {
                const p = e.target.getLatLng();
                pick(p.lat, p.lng);
              }
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
