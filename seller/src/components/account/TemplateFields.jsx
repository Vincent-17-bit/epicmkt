import { clock12, formatValue, visibleFields } from "@epicmkt/shared";
import { Field, FieldGroup } from "./ui.jsx";

const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Drop empty answers so they are not stored. */
export const cleanAttributes = (attributes) => Object.fromEntries(Object.entries(attributes).filter(([, v]) => !blank(v)));

const toLines = (list = []) => list.map((i) => (i.price == null ? i.name : `${i.name} | ${i.price}`)).join("\n");
const fromLines = (text) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, price] = l.split("|").map((x) => x.trim());
    return price !== undefined && price !== "" && Number.isFinite(Number(price)) ? { name, price: Number(price) } : { name };
  });

/** One input per template field, shaped by its type. Answers live in `value` (an attributes object). */
export function TemplateEditor({ fields, value, onChange, errors }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  return (
    <>
      {visibleFields(fields, value).map((f) => {
        const v = value[f.key];
        const error = errors?.[f.key];
        switch (f.type) {
          case "longtext":
            return <Field key={f.key} label={f.label} hint={f.hint} error={error}><textarea rows={3} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} /></Field>;
          case "number":
          case "price":
            return (
              <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} hint={f.hint} error={error}>
                <input inputMode="decimal" value={v ?? ""} onChange={(e) => set(f.key, e.target.value === "" ? undefined : Number(e.target.value))} />
              </Field>
            );
          case "boolean":
            return (
              <FieldGroup key={f.key} label={f.label} hint={f.hint} error={error}>
                <label className="sx-check"><input type="checkbox" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} /> Yes</label>
              </FieldGroup>
            );
          case "select":
            return (
              <Field key={f.key} label={f.label} hint={f.hint} error={error}>
                <select value={v ?? ""} onChange={(e) => set(f.key, e.target.value || undefined)}>
                  <option value="">Not set</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            );
          case "multiselect":
            return (
              <FieldGroup key={f.key} label={f.label} hint={f.hint} error={error}>
                <div className="sx-chips">
                  {f.options.map((o) => {
                    const on = (v ?? []).includes(o.value);
                    return <button key={o.value} type="button" className="sx-toggle" aria-pressed={on} onClick={() => set(f.key, on ? v.filter((x) => x !== o.value) : [...(v ?? []), o.value])}>{o.label}</button>;
                  })}
                </div>
              </FieldGroup>
            );
          case "timerange":
            return (
              <FieldGroup key={f.key} label={f.label} hint={f.hint} error={error}>
                <div className="sx-row">
                  <input type="time" aria-label={`${f.label} from`} value={v?.[0] ?? ""} onChange={(e) => set(f.key, e.target.value || v?.[1] ? [e.target.value, v?.[1] ?? ""] : undefined)} />
                  <span>to</span>
                  <input type="time" aria-label={`${f.label} to`} value={v?.[1] ?? ""} onChange={(e) => set(f.key, v?.[0] || e.target.value ? [v?.[0] ?? "", e.target.value] : undefined)} />
                </div>
              </FieldGroup>
            );
          case "itemlist":
            return (
              <Field key={f.key} label={f.label} hint={f.hint ?? "One per line. Add a price after a bar, for example: Haircut | 300"} error={error}>
                <textarea rows={4} value={toLines(v)} onChange={(e) => set(f.key, fromLines(e.target.value))} />
              </Field>
            );
          default:
            return <Field key={f.key} label={f.label} hint={f.hint} error={error}><input type={f.type === "url" ? "url" : "text"} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} /></Field>;
        }
      })}
    </>
  );
}

export function TemplateView({ fields, value }) {
  const rows = visibleFields(fields, value).filter((f) => !blank(value[f.key]));
  if (!rows.length) return <p className="sx-muted">Nothing filled in yet.</p>;
  return (
    <dl className="sx-dl">
      {rows.map((f) => <div key={f.key}><dt>{f.label}</dt><dd>{f.type === "timerange" ? `${clock12(value[f.key][0])} to ${clock12(value[f.key][1])}` : formatValue(f, value[f.key])}</dd></div>)}
    </dl>
  );
}
