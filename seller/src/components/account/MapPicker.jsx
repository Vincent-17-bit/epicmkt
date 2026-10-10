import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { pinInKenya } from "@epicmkt/shared";

const pinIcon = L.divIcon({ className: "sx-pin", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 28] });
const KENYA_CENTER = [-0.0236, 37.9062];

function Recenter({ target, nonce }) {
  const map = useMap();
  useEffect(() => {
    if (nonce && target) map.setView([target.lat, target.lng], Math.max(map.getZoom(), 16));
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickToPlace({ onPlace }) {
  useMapEvents({ click: (e) => onPlace({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * A map with one pin. Pass onChange to make the pin draggable (click the map or drag it, or use the
 * current-location button); without onChange it is a read-only view. Latitude and longitude are shown read-only.
 */
export default function MapPicker({ value, onChange, height = 280, idPrefix = "pin" }) {
  const [nonce, setNonce] = useState(0);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const markerRef = useRef(null);
  const editable = Boolean(onChange);
  const has = value && Number.isFinite(value.lat) && Number.isFinite(value.lng);
  const center = has ? [value.lat, value.lng] : KENYA_CENTER;

  const handlers = useMemo(
    () => ({
      dragend() {
        const p = markerRef.current?.getLatLng();
        if (p) onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange]
  );

  const useMyLocation = () => {
    setNote("");
    if (!navigator.geolocation) {
      setNote("This device cannot share its location. Place the pin by hand.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!pinInKenya(p.lat, p.lng)) {
          setNote("Your current location is outside Kenya. Place the pin by hand.");
          return;
        }
        onChange(p);
        setNonce((n) => n + 1);
      },
      () => {
        setLocating(false);
        setNote("We could not get your location. Allow location access, or place the pin by hand.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="sx-map">
      <div className="sx-map__frame" style={{ height }}>
        <MapContainer center={center} zoom={has ? 16 : 6} scrollWheelZoom={editable} dragging touchZoom style={{ height: "100%", width: "100%" }} attributionControl>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {has && <Marker position={[value.lat, value.lng]} icon={pinIcon} draggable={editable} ref={markerRef} eventHandlers={editable ? handlers : undefined} keyboard={editable} />}
          {editable && <ClickToPlace onPlace={onChange} />}
          <Recenter target={has ? value : null} nonce={nonce} />
        </MapContainer>
      </div>
      {editable && (
        <div className="sx-row sx-map__tools">
          <button type="button" className="sx-btn" onClick={useMyLocation} disabled={locating}>{locating ? "Finding you…" : "Use my current location"}</button>
          <span className="sx-hint">Click the map or drag the pin to the front door.</span>
        </div>
      )}
      {note && <p className="sx-error" role="status">{note}</p>}
      <div className="sx-grid2">
        <div className="sx-field">
          <label htmlFor={`${idPrefix}-lat`}>Latitude</label>
          <input id={`${idPrefix}-lat`} readOnly value={has ? value.lat.toFixed(6) : ""} placeholder="Not set" />
        </div>
        <div className="sx-field">
          <label htmlFor={`${idPrefix}-lng`}>Longitude</label>
          <input id={`${idPrefix}-lng`} readOnly value={has ? value.lng.toFixed(6) : ""} placeholder="Not set" />
        </div>
      </div>
    </div>
  );
}
