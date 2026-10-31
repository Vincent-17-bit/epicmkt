import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY, useBusinessFacts } from "../lib/useBusinessFacts.js";
import { showToast } from "../state/toast.js";
import { Row, Section } from "./controls.jsx";
import styles from "./settings.module.css";

// Loaded only when the section is on screen: the map library is large and most visits to Settings never touch it.
const MapPicker = lazy(() => import("./MapPicker.jsx"));

// The same box the application form and seller_set_location accept.
const inKenya = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -5 && p.lat <= 5.5 && p.lng >= 33.5 && p.lng <= 42;
const ADDRESS_MAX = 200;

export default function ShopLocation() {
  const qc = useQueryClient();
  const facts = useBusinessFacts().data;
  const saved = facts && facts.lat != null && facts.lng != null ? { lat: Number(facts.lat), lng: Number(facts.lng) } : null;
  const [pin, setPin] = useState(saved);
  const [address, setAddress] = useState(facts?.address ?? "");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  // Take what is saved once it has loaded, and again after a save refreshes it.
  useEffect(() => {
    if (!facts) return;
    setPin(facts.lat != null && facts.lng != null ? { lat: Number(facts.lat), lng: Number(facts.lng) } : null);
    setAddress(facts.address ?? "");
  }, [facts?.lat, facts?.lng, facts?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!facts) return null;

  const moved = (pin?.lat !== saved?.lat || pin?.lng !== saved?.lng) || address.trim() !== (facts.address ?? "").trim();
  const tooLong = address.length > ADDRESS_MAX;
  const readyToSave = moved && inKenya(pin) && !tooLong && !busy;

  const choose = (next) => { setError(null); setPin(next); };

  const locate = () => {
    setError(null);
    if (!navigator.geolocation) return setError("This device cannot share its location. Tap the map instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        choose({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
      },
      () => {
        setLocating(false);
        setError("We could not get your location. Allow location access, or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const save = async () => {
    if (!inKenya(pin)) return setError("Place the pin on the map inside Kenya first.");
    setBusy(true);
    setError(null);
    try {
      await api.setLocation({ lat: pin.lat, lng: pin.lng, address: address.trim() });
      await Promise.all([qc.invalidateQueries({ queryKey: FACTS_KEY }), qc.invalidateQueries({ queryKey: ["shop-preview"] })]);
      showToast("Shop location saved");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setError(null); setPin(saved); setAddress(facts.address ?? ""); };

  return (
    <Section id="location" title="Shop location" intro="This is where customers see your shop on the map. Move the pin whenever you relocate.">
      <Row label="Area" hint="To change your county or town, contact the team.">
        <strong>{[facts.town, facts.county].filter(Boolean).join(", ") || "Not set"}</strong>
      </Row>
      <Row label="Landmark" hint="Describe it the way you would to a boda rider." stack>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="shop-landmark">Address or landmark</label>
          <input id="shop-landmark" className={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="For example Next to Maseno market gate" aria-invalid={tooLong ? "true" : undefined} autoComplete="street-address" />
          {tooLong && <p className={styles.error} role="alert">Keep it under {ADDRESS_MAX} characters.</p>}
        </div>
      </Row>
      <Row label="Pin on the map" hint="Tap the map or drag the pin. With a keyboard, use the arrow keys." stack>
        <div className={styles.page}>
          <Suspense fallback={<p className={styles.muted}>Loading the map…</p>}>
            <MapPicker value={pin} onChange={choose} />
          </Suspense>
          <p className={styles.note} role="status" data-testid="pin-state">
            {inKenya(pin) ? `Pin at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "No pin yet. Tap the map to place it."}
          </p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={locate} disabled={locating || busy}>{locating ? "Finding you…" : "Use my location"}</Button>
            <Button onClick={save} disabled={!readyToSave}>{busy ? "Saving…" : "Save location"}</Button>
            {moved && !busy && <button type="button" className={styles.linkBtn} onClick={reset}>Undo changes</button>}
          </div>
        </div>
      </Row>
    </Section>
  );
}
