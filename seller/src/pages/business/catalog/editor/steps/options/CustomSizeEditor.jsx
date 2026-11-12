import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { BODY_FIELDS, CUSTOM_SIZE_LIMITS, DIMENSION_FIELDS, emptyCustomSize, fieldFrom } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./options.module.css";

// Made to measure (Prompt 3.4), for tailors and furniture makers: which option carries it, the measurements the buyer must give,
// and how it is priced. Config shape and rules: shared/src/options/customSize.js.
export default function CustomSizeEditor({ options, config, set, errors = {}, announce }) {
  const uid = useId();
  const on = Boolean(config?.enabled);
  const cfg = config ?? emptyCustomSize(options.axes[0]?.key ?? "");
  const err = (p) => errors[`custom.${p}`];
  const put = (patch) => set({ ...cfg, ...patch });
  const putField = (i, patch) => put({ fields: cfg.fields.map((f, n) => (n === i ? { ...f, ...patch } : f)) });
  const addFields = (list) => put({ fields: [...cfg.fields, ...list.filter((p) => !cfg.fields.some((f) => f.key === fieldFrom(p).key)).map(fieldFrom)].slice(0, CUSTOM_SIZE_LIMITS.fields) });
  const price = cfg.price ?? { mode: "fixed", base: "" };
  const num = (id, label, value, onChange, path, extra = {}) => (
    <div className={ed.field}>
      <label className={ed.label} htmlFor={`${uid}-${id}`}>{label}</label>
      <input id={`${uid}-${id}`} className={ed.input} data-focus={`opt-custom.${path}`} inputMode="decimal" autoComplete="off" value={value ?? ""} aria-invalid={err(path) ? "true" : undefined} onChange={(e) => onChange(e.target.value)} {...extra} />
      {err(path) && <p className={ed.error}>{err(path)}</p>}
    </div>
  );

  return (
    <div className={s.depSwitch} data-on={on ? "" : undefined}>
      <label className={s.switchRow}>
        <span className={s.switchText}>
          <span>Also offer made to measure</span>
          <span className={s.switchHint}>Buyers can give their own measurements instead of picking a size.</span>
        </span>
        <input type="checkbox" role="switch" className={s.switchInput} checked={on}
          onChange={(e) => { set(e.target.checked ? { ...cfg, enabled: true, axisKey: cfg.axisKey || options.axes[0]?.key || "" } : { ...cfg, enabled: false }); announce(e.target.checked ? "Made to measure is on." : "Made to measure is off."); }} />
        <span className={s.track} aria-hidden="true" />
      </label>

      {on && (
        <div className={s.stack}>
          {options.axes.length > 1 && (
            <div className={ed.field}>
              <label className={ed.label} htmlFor={`${uid}-axis`}>Offer it beside the values of</label>
              <select id={`${uid}-axis`} className={ed.input} value={cfg.axisKey} onChange={(e) => put({ axisKey: e.target.value })}>{options.axes.map((a) => <option key={a.key} value={a.key}>{a.label || a.key}</option>)}</select>
            </div>
          )}

          <fieldset className={s.depSet}>
            <legend>Measurements the buyer must give</legend>
            {err("fields") && <p className={ed.error} data-focus="opt-custom.fields" tabIndex={-1}>{err("fields")}</p>}
            {cfg.fields.length > 0 && (
              <ul className={s.specRows}>
                {cfg.fields.map((f, i) => (
                  <li key={f.key} className={s.cmRow}>
                    <div className={ed.field}>
                      <label className={ed.label} htmlFor={`${uid}-l${i}`}>Name</label>
                      <input id={`${uid}-l${i}`} className={ed.input} data-focus={`opt-custom.fields.${i}.label`} value={f.label} maxLength={CUSTOM_SIZE_LIMITS.label} aria-invalid={err(`fields.${i}.label`) ? "true" : undefined} onChange={(e) => putField(i, { label: e.target.value })} />
                      {err(`fields.${i}.label`) && <p className={ed.error}>{err(`fields.${i}.label`)}</p>}
                    </div>
                    <div className={ed.field}>
                      <label className={ed.label} htmlFor={`${uid}-u${i}`}>Unit</label>
                      <select id={`${uid}-u${i}`} className={ed.input} value={f.unit} onChange={(e) => putField(i, { unit: e.target.value })}><option value="cm">cm</option><option value="in">in</option></select>
                    </div>
                    {num(`mn${i}`, "Smallest", f.min, (v) => putField(i, { min: v }), `fields.${i}.min`)}
                    {num(`mx${i}`, "Biggest", f.max, (v) => putField(i, { max: v }), `fields.${i}.max`)}
                    <label className={s.check}><input type="checkbox" checked={f.required !== false} onChange={(e) => putField(i, { required: e.target.checked })} />Required<span className={ed.sr}>: {f.label}</span></label>
                    <button type="button" className={s.chipBtn} style={{ inlineSize: "var(--tap)", blockSize: "var(--tap)" }} aria-label={`Remove ${f.label || "measurement"}`} onClick={() => put({ fields: cfg.fields.filter((_, n) => n !== i) })}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
            <ul className={s.presets}>
              <li><button type="button" className={s.pill} onClick={() => addFields(BODY_FIELDS)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />Body measurements</button></li>
              <li><button type="button" className={s.pill} onClick={() => addFields(DIMENSION_FIELDS)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />Width, depth, height</button></li>
            </ul>
          </fieldset>

          <fieldset className={s.depSet}>
            <legend>Price</legend>
            <div className={ed.field}>
              <label className={ed.label} htmlFor={`${uid}-mode`}>How is it priced?</label>
              <select id={`${uid}-mode`} className={ed.input} value={price.mode} onChange={(e) => put({ price: { ...price, mode: e.target.value } })}>
                <option value="fixed">One price for any measurements</option>
                <option value="per-extra">A base price plus an amount for each extra cm or inch</option>
              </select>
            </div>
            <div className={s.toolGrid}>
              {num("base", "Base price (KES)", price.base, (v) => put({ price: { ...price, base: v } }), "price.base")}
              {price.mode === "per-extra" && (
                <>
                  <div className={ed.field}>
                    <label className={ed.label} htmlFor={`${uid}-pf`}>Counted on</label>
                    <select id={`${uid}-pf`} className={ed.input} data-focus="opt-custom.price.field" value={price.field ?? ""} onChange={(e) => put({ price: { ...price, field: e.target.value } })}>
                      <option value="">Choose a measurement</option>{cfg.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    {err("price.field") && <p className={ed.error}>{err("price.field")}</p>}
                  </div>
                  {num("over", "Extra starts above", price.over, (v) => put({ price: { ...price, over: v } }), "price.over")}
                  {num("per", "Extra price for each unit (KES)", price.perUnit, (v) => put({ price: { ...price, perUnit: v } }), "price.perUnit")}
                </>
              )}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
