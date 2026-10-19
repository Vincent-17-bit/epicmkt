import { AVAILABILITY_OPTIONS, BADGE_OPTIONS, ISSUE_OPTIONS, PRICE_TYPE_OPTIONS, VISIBILITY_OPTIONS } from "@epicmkt/shared";
import styles from "./catalog.module.css";

const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

function Group({ legend, children }) {
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

function Checks({ options, value, onChange, name }) {
  return options.map((o) => (
    <label key={o.key} className={styles.check}>
      <input type="checkbox" checked={value.includes(o.key)} onChange={() => onChange(toggle(value, o.key))} data-testid={`${name}-${o.key}`} />
      <span>{o.label}</span>
    </label>
  ));
}

const numberOrNull = (v) => {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export default function FilterPanel({ query, onChange, sections, bounds }) {
  const lo = query.min ?? bounds.min;
  const hi = query.max ?? bounds.max;
  return (
    <div className={styles.panel}>
      <Group legend="Section">
        <select className={styles.select} value={query.section} onChange={(e) => onChange({ section: e.target.value })} aria-label="Section">
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Group>
      <Group legend="Price type"><Checks name="ptype" options={PRICE_TYPE_OPTIONS} value={query.ptype} onChange={(v) => onChange({ ptype: v })} /></Group>
      <Group legend="Availability"><Checks name="avail" options={AVAILABILITY_OPTIONS} value={query.avail} onChange={(v) => onChange({ avail: v })} /></Group>
      <Group legend="Visibility"><Checks name="vis" options={VISIBILITY_OPTIONS} value={query.vis} onChange={(v) => onChange({ vis: v })} /></Group>
      <Group legend="Has issues"><Checks name="issues" options={ISSUE_OPTIONS} value={query.issues} onChange={(v) => onChange({ issues: v })} /></Group>
      <Group legend="Price range (KES)">
        <div className={styles.rangeFields}>
          <label>
            <span className={styles.sr}>Minimum price</span>
            <input className={styles.num} type="number" min="0" inputMode="numeric" placeholder="Min" aria-label="Minimum price" value={query.min ?? ""} onChange={(e) => onChange({ min: numberOrNull(e.target.value) })} />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className={styles.sr}>Maximum price</span>
            <input className={styles.num} type="number" min="0" inputMode="numeric" placeholder="Max" aria-label="Maximum price" value={query.max ?? ""} onChange={(e) => onChange({ max: numberOrNull(e.target.value) })} />
          </label>
        </div>
        {bounds.max > bounds.min && (
          <div className={styles.sliders}>
            <input type="range" min={bounds.min} max={bounds.max} value={Math.min(lo, hi)} aria-label="Minimum price slider" onChange={(e) => onChange({ min: Math.min(Number(e.target.value), hi) })} />
            <input type="range" min={bounds.min} max={bounds.max} value={Math.max(lo, hi)} aria-label="Maximum price slider" onChange={(e) => onChange({ max: Math.max(Number(e.target.value), lo) })} />
          </div>
        )}
      </Group>
      <Group legend="More">
        <label className={styles.check}><input type="checkbox" checked={query.sale} onChange={(e) => onChange({ sale: e.target.checked })} /><span>On sale</span></label>
        <label className={styles.check}><input type="checkbox" checked={query.video} onChange={(e) => onChange({ video: e.target.checked })} /><span>Has video</span></label>
        <label className={styles.check}><input type="checkbox" checked={query.variants} onChange={(e) => onChange({ variants: e.target.checked })} /><span>Has variants</span></label>
        <label className={styles.check}><input type="checkbox" checked={query.stock} onChange={(e) => onChange({ stock: e.target.checked })} /><span>With stock count</span></label>
        <label className={styles.stack}>
          <span>Badge</span>
          <select className={styles.select} value={query.badge} onChange={(e) => onChange({ badge: e.target.value })}>
            <option value="">Any badge</option>
            {BADGE_OPTIONS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </label>
        <label className={styles.stack}>
          <span>Updated</span>
          <select className={styles.select} value={query.updated} onChange={(e) => onChange({ updated: e.target.value })}>
            <option value="">Any time</option>
            <option value="7">In the last 7 days</option>
            <option value="30">In the last 30 days</option>
          </select>
        </label>
      </Group>
    </div>
  );
}
