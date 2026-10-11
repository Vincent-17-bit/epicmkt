import { ISSUES, ISSUE_LABELS, LISTING_AVAILABILITY, AVAILABILITY_LABELS, VISIBILITY, VISIBILITY_LABELS } from "@epicmkt/shared";
import styles from "./listings.module.css";

function Group({ legend, options, labels, selected, onToggle }) {
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {options.map((key) => (
        <label key={key} className={styles.option}>
          <input type="checkbox" checked={selected.includes(key)} onChange={() => onToggle(key)} />
          <span>{labels[key]}</span>
        </label>
      ))}
    </fieldset>
  );
}

const toggle = (list, key) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

const parse = (text, bound, fallback) => {
  if (text === "") return fallback;
  const n = Math.floor(Number(text));
  return Number.isFinite(n) && n >= bound ? n : fallback;
};

export default function FilterFields({ view, onChange, sections, types, badges, bounds }) {
  const set = (patch) => onChange({ ...view, ...patch });
  const lo = view.priceMin ?? bounds.min;
  const hi = view.priceMax ?? bounds.max;
  const setMin = (value) => set({ priceMin: value <= bounds.min ? null : Math.min(value, hi) });
  const setMax = (value) => set({ priceMax: value >= bounds.max ? null : Math.max(value, lo) });

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>Section</span>
        <select value={view.section} onChange={(e) => set({ section: e.target.value })}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>Type</span>
        <select value={view.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All types</option>
          {types.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <Group legend="Availability" options={LISTING_AVAILABILITY} labels={AVAILABILITY_LABELS} selected={view.availability} onToggle={(k) => set({ availability: toggle(view.availability, k) })} />
      <Group legend="Visibility" options={VISIBILITY} labels={VISIBILITY_LABELS} selected={view.visibility} onToggle={(k) => set({ visibility: toggle(view.visibility, k) })} />
      <Group legend="Has issues" options={ISSUES} labels={ISSUE_LABELS} selected={view.issues} onToggle={(k) => set({ issues: toggle(view.issues, k) })} />
      <fieldset className={styles.group}>
        <legend>Price (KSh)</legend>
        <div className={styles.priceNumbers}>
          <label className={styles.field}>
            <span>Minimum</span>
            <input type="number" inputMode="numeric" min={0} value={view.priceMin ?? ""} placeholder={String(bounds.min)} onChange={(e) => set({ priceMin: parse(e.target.value, 0, null) })} />
          </label>
          <label className={styles.field}>
            <span>Maximum</span>
            <input type="number" inputMode="numeric" min={0} value={view.priceMax ?? ""} placeholder={String(bounds.max)} onChange={(e) => set({ priceMax: parse(e.target.value, 0, null) })} />
          </label>
        </div>
        <input type="range" aria-label="Minimum price" min={bounds.min} max={bounds.max} step={bounds.step} value={Math.min(lo, bounds.max)} onChange={(e) => setMin(Number(e.target.value))} />
        <input type="range" aria-label="Maximum price" min={bounds.min} max={bounds.max} step={bounds.step} value={Math.min(hi, bounds.max)} onChange={(e) => setMax(Number(e.target.value))} />
      </fieldset>
      <fieldset className={styles.group}>
        <legend>More</legend>
        <label className={styles.option}><input type="checkbox" checked={view.onSale} onChange={() => set({ onSale: !view.onSale })} /><span>On sale</span></label>
        <label className={styles.option}><input type="checkbox" checked={view.hasVideo} onChange={() => set({ hasVideo: !view.hasVideo })} /><span>Has video</span></label>
        <label className={styles.option}><input type="checkbox" checked={view.hasVariants} onChange={() => set({ hasVariants: !view.hasVariants })} /><span>Has variants</span></label>
        <label className={styles.option}><input type="checkbox" checked={view.withStock} onChange={() => set({ withStock: !view.withStock })} /><span>With stock count</span></label>
      </fieldset>
      <label className={styles.field}>
        <span>Badge</span>
        <select value={view.badge} onChange={(e) => set({ badge: e.target.value })}>
          <option value="">Any badge</option>
          {badges.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>Updated</span>
        <select value={view.updated} onChange={(e) => set({ updated: e.target.value })}>
          <option value="">Any time</option>
          <option value="7">In the last 7 days</option>
          <option value="30">In the last 30 days</option>
        </select>
      </label>
    </div>
  );
}
