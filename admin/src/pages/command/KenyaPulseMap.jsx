import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { Button, Card, Skeleton } from "../../components/index.js";
import { useReducedMotion } from "../../components/useReducedMotion.js";
import { LAYERS, describeDays, displayLayer } from "../../lib/pulse.js";
import { Glyph, glyphSvg } from "./glyph.jsx";
import s from "./pulse.module.css";

const HOME = { center: [0.25, 37.9], zoom: 6 };
const LIST_LIMIT = 40;
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const detail = (item) => (item.kind === "application" ? `Application, ${item.status.replace(/_/g, " ")}` : describeDays(item.days));

export default function KenyaPulseMap({ items, loading, onPeek }) {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(() => new Set(LAYERS.map((layer) => layer.key)));
  const [bounds, setBounds] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const markersRef = useRef(new Map());
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const peekRef = useRef(onPeek);
  peekRef.current = onPeek;

  const shown = useMemo(() => (items ?? []).filter((item) => displayLayer(item, enabled)), [items, enabled]);
  const counts = useMemo(() => Object.fromEntries(LAYERS.map((layer) => [layer.key, (items ?? []).filter((item) => item.layers.includes(layer.key)).length])), [items]);

  const inView = useMemo(() => (bounds ? shown.filter((item) => bounds.contains([item.lat, item.lng])) : []), [shown, bounds]);

  useEffect(() => {
    if (loading || !elRef.current) return undefined;
    const map = L.map(elRef.current, { center: HOME.center, zoom: HOME.zoom, minZoom: 5, maxBounds: [[-6, 32], [6.5, 43]], zoomAnimation: !reducedRef.current, fadeAnimation: !reducedRef.current });
    L.tileLayer(TILES, { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const cluster = L.markerClusterGroup({
      animate: !reducedRef.current,
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      iconCreateFunction: (group) => L.divIcon({ html: `<span>${group.getChildCount()}</span>`, className: s.cluster, iconSize: [38, 38] }),
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    const syncBounds = () => setBounds(map.getBounds());
    map.on("moveend", syncBounds);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(elRef.current);
    syncBounds();
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markersRef.current = new Map();
    };
  }, [loading]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const markers = new Map();
    const batch = shown.map((item) => {
      const layer = displayLayer(item, enabled);
      const marker = L.marker([item.lat, item.lng], {
        title: `${item.name}, ${item.county}`,
        alt: `${item.name}, ${item.county}. ${layer.label}. ${detail(item)}`,
        icon: L.divIcon({ html: glyphSvg(layer.shape, layer.tone, 24), className: s.marker, iconSize: [24, 24] }),
      });
      marker.on("click", () => peekRef.current?.(item));
      markers.set(item.id, marker);
      return marker;
    });
    cluster.addLayers(batch);
    markersRef.current = markers;
  }, [shown, enabled]);

  useEffect(() => {
    const marker = highlight ? markersRef.current.get(highlight) : null;
    const el = marker?.getElement?.();
    el?.classList.add(s.markerActive);
    return () => el?.classList.remove(s.markerActive);
  }, [highlight]);

  const toggleLayer = (key) => setEnabled((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const focusItem = (item) => {
    const marker = markersRef.current.get(item.id);
    if (!marker || !clusterRef.current) return;
    clusterRef.current.zoomToShowLayer(marker, () => marker.getElement()?.focus());
  };

  const listed = inView.slice(0, LIST_LIMIT);

  return (
    <Card as="section" title="Kenya pulse" headingLevel={2} className={s.span7} data-slot="kenya-pulse">
      {loading ? <Skeleton height="26rem" /> : (
        <div className={s.pulse}>
          <div className={s.toolbar}>
            <ul className={s.layers} aria-label="Map layers">
              {LAYERS.map((layer) => (
                <li key={layer.key}>
                  <button type="button" className={s.layerBtn} aria-pressed={enabled.has(layer.key)} onClick={() => toggleLayer(layer.key)}>
                    <svg width="16" height="16" viewBox="-10 -10 20 20" aria-hidden="true"><Glyph shape={layer.shape} tone={layer.tone} r={6} /></svg>
                    <span>{layer.label}</span>
                    <b className={s.num}>{counts[layer.key]}</b>
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={() => mapRef.current?.setView(HOME.center, HOME.zoom, { animate: !reduced })}>Reset view</Button>
          </div>
          <div className={s.mapGrid}>
            <div ref={elRef} className={s.map} role="region" aria-label="Map of businesses and applications across Kenya" />
            <div className={s.side}>
              <p className={s.sideHead} aria-live="polite">{inView.length} in view{inView.length > LIST_LIMIT ? `, showing ${LIST_LIMIT}` : ""}</p>
              {listed.length === 0 ? <p className={s.panelNote}>Nothing in this part of the map. Zoom out or turn on more layers.</p> : (
                <ul className={s.sideList}>
                  {listed.map((item) => {
                    const layer = displayLayer(item, enabled);
                    return (
                      <li key={item.id} onMouseEnter={() => setHighlight(item.id)} onMouseLeave={() => setHighlight(null)}>
                        <button type="button" className={s.sideItem} onClick={() => focusItem(item)} onFocus={() => setHighlight(item.id)} onBlur={() => setHighlight(null)}>
                          <svg width="16" height="16" viewBox="-10 -10 20 20" aria-hidden="true"><Glyph shape={layer.shape} tone={layer.tone} r={6} /></svg>
                          <span className={s.sideText}><strong>{item.name}</strong><span>{item.county} · {detail(item)}</span></span>
                        </button>
                        <Button size="sm" variant="ghost" onClick={() => onPeek?.(item)} aria-label={`Preview ${item.name}`}>Peek</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
