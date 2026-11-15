import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@epicmkt/ui";
import { DELIVERY_LIMITS, checkDeliverySetting, deliveryInfo, formatKes } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY, useBusinessFacts } from "../lib/useBusinessFacts.js";
import { usePlanFeatures } from "../lib/usePlanFeatures.js";
import { showToast } from "../state/toast.js";
import { Row, Section, Switch } from "./controls.jsx";
import styles from "./settings.module.css";

const FIELD_TEXT = {
  invalid_fee: "Enter the fee as a number of shillings, zero or more.",
  invalid_radius: "Enter the distance in kilometres, more than zero.",
  invalid_min_order: "Enter the minimum order as a number of shillings, zero or more.",
  invalid_area: `Keep the area under ${DELIVERY_LIMITS.areaMax} characters.`,
  invalid_notes: `Keep the notes under ${DELIVERY_LIMITS.notesMax} characters.`
};

const asText = (v) => (v === null || v === undefined ? "" : String(v));
const fromFacts = (f) => ({ offers: f?.delivers === true, fee: asText(f?.delivery_fee), radiusKm: asText(f?.delivery_radius_km), area: asText(f?.delivery_area), minOrder: asText(f?.delivery_min_order), notes: asText(f?.delivery_notes) });

/** The line a buyer reads, from the same reader the item page uses, so the preview cannot drift from the page. */
export function previewLine(value, shopArea) {
  const info = deliveryInfo({ delivery: { offers: value.offers, fee: value.fee === "" ? null : Number(value.fee), radiusKm: value.radiusKm === "" ? null : Number(value.radiusKm), area: value.area || null, minOrder: value.minOrder === "" ? null : Number(value.minOrder), notes: value.notes || null } });
  if (!info.offers) return shopArea ? `No delivery. Pick up from the shop, ${shopArea}.` : "No delivery. Buyers pick up from the shop.";
  const parts = [info.fee === 0 ? "Free delivery" : info.fee != null ? `Delivery from ${formatKes(info.fee)}` : "Delivers"];
  if (info.area) parts.push(`to ${info.area}`);
  if (info.radiusKm != null) parts.push(`within ${info.radiusKm} km`);
  if (info.minOrder != null && info.minOrder > 0) parts.push(`minimum order ${formatKes(info.minOrder)}`);
  return parts.join(" ") + ".";
}

export default function ShopDelivery() {
  const qc = useQueryClient();
  const facts = useBusinessFacts().data;
  const planHasDelivery = usePlanFeatures().delivery;
  const uid = useId();
  const saved = useMemo(() => fromFacts(facts), [facts]);
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => { setValue(saved); setFieldErrors({}); setError(null); }, [saved]);
  if (!facts) return null;

  const set = (key) => (e) => { setValue((v) => ({ ...v, [key]: e.target.value })); setFieldErrors((f) => ({ ...f, [key]: undefined })); };
  const changed = JSON.stringify(value) !== JSON.stringify(saved);
  const area = [facts.town, facts.county].filter(Boolean).join(", ");

  const save = async () => {
    const checked = checkDeliverySetting({ offers: value.offers, fee: value.fee, radiusKm: value.radiusKm, area: value.area, minOrder: value.minOrder, notes: value.notes });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setError("Fix the marked fields first.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await api.setDelivery(checked.value);
      await Promise.all([qc.invalidateQueries({ queryKey: FACTS_KEY }), qc.invalidateQueries({ queryKey: ["shop-preview"] })]);
      showToast("Delivery saved");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => {
    const code = fieldErrors[key];
    const msg = code ? FIELD_TEXT[code] ?? "This value is not valid." : null;
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${uid}-${key}`}>{label}</label>
        <input id={`${uid}-${key}`} className={styles.input} value={value[key]} onChange={set(key)} aria-invalid={msg ? "true" : undefined} aria-describedby={msg ? `${uid}-${key}-e` : undefined} disabled={busy} {...props} />
        {msg && <p className={styles.error} id={`${uid}-${key}-e`} role="alert">{msg}</p>}
      </div>
    );
  };

  return (
    <Section id="delivery" title="Delivery" intro="Tell buyers whether you deliver. This shows on every item page of your shop.">
      <Row label="I deliver" hint={value.offers ? "Buyers see your fee, area and distance." : "Buyers see “No delivery” and where to pick up."}>
        <Switch checked={value.offers} onChange={(on) => setValue((v) => ({ ...v, offers: on }))} label="I deliver" disabled={busy || (!planHasDelivery && !value.offers)} />
      </Row>
      {!planHasDelivery && <p className={styles.note} role="note">Delivery is not part of your plan{value.offers ? ", so buyers no longer see it. You can switch it off here." : "."}</p>}
      {value.offers && (
        <>
          <Row label="Fee and distance" hint="Leave the fee empty if it depends on the place. Enter 0 for free delivery." stack>
            <div className={styles.page}>
              {field("fee", "Delivery fee (KES)", { inputMode: "decimal", placeholder: "For example 150" })}
              {field("radiusKm", "How far you deliver (km)", { inputMode: "decimal", placeholder: "For example 5" })}
              {field("minOrder", "Minimum order (KES)", { inputMode: "decimal", placeholder: "Optional" })}
            </div>
          </Row>
          <Row label="Area and notes" stack>
            <div className={styles.page}>
              {field("area", "Where you deliver", { placeholder: "For example Westlands and Parklands", maxLength: DELIVERY_LIMITS.areaMax + 20 })}
              {field("notes", "Notes for buyers", { placeholder: "For example Orders before noon go out the same day", maxLength: DELIVERY_LIMITS.notesMax + 20 })}
            </div>
          </Row>
        </>
      )}
      <Row label="What buyers will read" stack>
        <p className={styles.note} role="status" data-testid="delivery-preview">{previewLine(value, area)}</p>
      </Row>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <Button onClick={save} disabled={!changed || busy}>{busy ? "Saving…" : "Save delivery"}</Button>
        {changed && !busy && <button type="button" className={styles.linkBtn} onClick={() => { setValue(saved); setFieldErrors({}); setError(null); }}>Undo changes</button>}
      </div>
    </Section>
  );
}
