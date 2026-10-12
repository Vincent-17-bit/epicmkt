import { useState } from "react";
import { Button } from "@epicmkt/ui";
import { PRICE_REMINDER_DAYS, THRESHOLD_MAX, UNITS_PER_CATEGORY, UNIT_MAX } from "@epicmkt/shared";
import { useSession } from "../state/session.js";
import { useSettings } from "../state/settings.js";
import { categoryKey, suggestedUnits } from "../lib/defaults.js";
import { CommitField, Row, Section, Segmented, Select, Switch } from "./controls.jsx";
import styles from "./settings.module.css";

const AVAILABILITY = [
  { value: "available", label: "Available" },
  { value: "limited_stock", label: "Limited stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "unavailable", label: "Unavailable" }
];

export default function CatalogDefaults() {
  const me = useSession((s) => s.me);
  const c = useSettings((s) => s.settings.catalog);
  const update = useSettings((s) => s.update);
  const set = (patch, message) => update({ catalog: patch }, message ? { message } : undefined);
  const key = categoryKey(me.business);
  const stored = c.default_units[key];
  const units = stored && stored.length ? stored : suggestedUnits();
  const [unit, setUnit] = useState("");
  const [unitError, setUnitError] = useState(null);

  const saveUnits = (list, message) => update({ catalog: { default_units: { [key]: list } } }, message ? { message } : undefined);
  const addUnit = (e) => {
    e.preventDefault();
    const v = unit.trim();
    if (!v) return;
    if (v.length > UNIT_MAX) return setUnitError(`Up to ${UNIT_MAX} characters.`);
    if (units.some((u) => u.toLowerCase() === v.toLowerCase())) return setUnitError("That unit is already in the list.");
    if (units.length >= UNITS_PER_CATEGORY) return setUnitError(`Up to ${UNITS_PER_CATEGORY} units.`);
    setUnitError(null);
    setUnit("");
    saveUnits([...units, v]);
  };

  return (
    <Section id="catalog" title="Catalog defaults" intro="Used when you add, duplicate or import items, and when we remind you about prices.">
      <Row label="Default availability" hint="For new items.">
        <Select label="Default availability" value={c.default_availability} onChange={(v) => set({ default_availability: v })} options={AVAILABILITY} />
      </Row>
      <Row label="Low-stock threshold" hint="Items at or below this count show as limited stock." stack>
        <CommitField label="Low-stock threshold" type="number" inputMode="numeric" value={String(c.low_stock_threshold)} validate={(v) => (/^\d{1,4}$/.test(v.trim()) && Number(v) <= THRESHOLD_MAX ? null : `Use a whole number from 0 to ${THRESHOLD_MAX}.`)} onCommit={(v) => set({ low_stock_threshold: Number(v) })} />
      </Row>
      <Row label="Price reminder" hint="How often we ask you to confirm your prices.">
        <Select label="Price reminder interval" value={String(c.price_reminder_days)} onChange={(v) => set({ price_reminder_days: Number(v) })} options={PRICE_REMINDER_DAYS.map((d) => ({ value: String(d), label: `Every ${d} days` }))} />
      </Row>
      <Row label="New items start as">
        <Segmented label="New items start as" value={c.start_visible ? "visible" : "hidden"} onChange={(v) => set({ start_visible: v === "visible" })} options={[{ value: "visible", label: "Visible" }, { value: "hidden", label: "Hidden" }]} />
      </Row>
      <Row label="Show “Only N left”" hint="On limited-stock items that track their count.">
        <Switch checked={c.show_only_n_left} label="Show Only N left" onChange={(v) => set({ show_only_n_left: v })} />
      </Row>
      <Row label="Default units" hint="Offered when you price an item. Tap × to remove." stack>
        <ul className={styles.chips} aria-label="Default units">
          {units.map((u) => (
            <li key={u} className={styles.chip}>
              <span>{u}</span>
              <button type="button" aria-label={`Remove ${u}`} onClick={() => saveUnits(units.filter((x) => x !== u))}>×</button>
            </li>
          ))}
        </ul>
        <form className={styles.addRow} onSubmit={addUnit}>
          <input className={styles.input} value={unit} onChange={(e) => { setUnit(e.target.value); setUnitError(null); }} placeholder="Add a unit, for example kg" aria-label="New unit" aria-invalid={unitError ? "true" : undefined} />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
        {unitError && <p className={styles.error} role="alert">{unitError}</p>}
        {stored && stored.length > 0 && <button type="button" className={styles.linkBtn} onClick={() => saveUnits([], "Reset to suggested units")}>Reset to suggested units</button>}
      </Row>
    </Section>
  );
}
