import { faBoxOpen, faListCheck, faPlus, faSliders } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SPEC_DEFAULT_GROUP, SPEC_GROUPS, SPEC_LIMITS } from "@epicmkt/shared";
import { LIMITS, SPEC_PRESETS } from "./model.js";
import { Field, RowList, SectionCard } from "./parts.jsx";
import styles from "./editor.module.css";

export default function DetailsSection({ form, patch, errors, focusOn }) {
  const hl = LIMITS.highlights;
  const inc = LIMITS.includes;
  const used = new Set(form.specs.map((s) => String(s.label ?? "").trim().toLowerCase()));
  const specsFull = form.specs.length >= SPEC_LIMITS.rows;

  return (
    <SectionCard id="details" title="Details" why="Highlights, specifications and terms answer the questions customers would otherwise message you to ask.">
      <div className={styles.subBlock} data-area="highlights">
        <h3 className={styles.subTitle}>About this item</h3>
        <p className={styles.hint}>Short selling points. The bold lead is optional and shows before the text.</p>
        <RowList
          noun={{ key: "hl", label: "Highlight", name: "highlight" }} rows={form.highlights} max={hl.rows} onChange={(v) => patch("highlights", v)} focusOn={focusOn}
          blank={{ title: "", text: "" }} focusFirst={(n) => `hl-${n}-title`} addLabel="Add highlight" addKey="add-highlight" icon={faListCheck}
          empty={{ title: "No highlights yet", body: "Add up to 8 short points, like \"Free delivery in Kisumu\" or \"Made with real butter\"." }}
          error={errors.highlightsCount} errorKey="highlightsCount"
          renderRow={(h, i, edit) => (
            <>
              <Field name={`hl-${i}-title`} label={`Highlight ${i + 1} title`} area="highlights" max={hl.title} value={h.title} error={errors.highlights?.[i]?.title} onChange={(e) => edit((r) => ({ ...r, title: e.target.value }))} />
              <Field name={`hl-${i}-text`} label={`Highlight ${i + 1} text`} area="highlights" max={hl.text} value={h.text} error={errors.highlights?.[i]?.text} onChange={(e) => edit((r) => ({ ...r, text: e.target.value }))} />
            </>
          )}
        />
      </div>

      <div className={styles.subBlock} data-area="specs">
        <h3 className={styles.subTitle}>Specifications</h3>
        <p className={styles.hint}>Short facts about this item. The group decides which part of the item page each fact appears under.</p>
        <ul className={styles.presets} aria-label="Quick add">
          {SPEC_PRESETS.map((p) => (
            <li key={p.label}>
              <button type="button" className={styles.chip} disabled={specsFull || used.has(p.label.toLowerCase())}
                onClick={() => { focusOn(`spec-${form.specs.length}-value`); patch("specs", [...form.specs, { group: p.group, label: p.label, value: "" }]); }}>
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> {p.label}
              </button>
            </li>
          ))}
        </ul>
        <RowList
          noun={{ key: "spec", label: "Specification", name: "specification" }} rows={form.specs} max={SPEC_LIMITS.rows} onChange={(v) => patch("specs", v)} focusOn={focusOn}
          blank={{ group: SPEC_DEFAULT_GROUP, label: "", value: "" }} focusFirst={() => `spec-${form.specs.length}-label`} addLabel="Add custom row" addKey="add-spec" icon={faSliders}
          empty={{ title: "No specifications yet", body: "Tap a quick add above, like Material or Weight, or add your own row." }}
          error={errors.specsCount} errorKey="specsCount"
          renderRow={(s, i, edit) => (
            <>
              <Field name={`spec-${i}-group`} as="select" label="Group" area="specs" value={s.group || SPEC_DEFAULT_GROUP} error={errors.specs?.[i]?.group} onChange={(e) => { focusOn(`spec-${i}-group`); edit((r) => ({ ...r, group: e.target.value })); }}>
                {SPEC_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </Field>
              <Field name={`spec-${i}-label`} label="Label" area="specs" maxLength={SPEC_LIMITS.label} value={s.label} error={errors.specs?.[i]?.label} onChange={(e) => edit((r) => ({ ...r, label: e.target.value }))} />
              <Field name={`spec-${i}-value`} label="Value" area="specs" maxLength={SPEC_LIMITS.value} value={s.value} error={errors.specs?.[i]?.value} onChange={(e) => edit((r) => ({ ...r, value: e.target.value }))} />
            </>
          )}
        />
      </div>

      <div className={styles.subBlock} data-area="includes">
        <h3 className={styles.subTitle}>What is included</h3>
        <p className={styles.hint}>List what comes with the item, such as a charger or a gift box.</p>
        <RowList
          noun={{ key: "inc", label: "Included item", name: "included item" }} rows={form.includes} max={inc.rows} onChange={(v) => patch("includes", v)} focusOn={focusOn}
          blank="" focusFirst={(n) => `inc-${n}`} addLabel="Add included item" addKey="add-include" icon={faBoxOpen}
          empty={{ title: "Nothing listed yet", body: "Add what is in the box or the booking, like \"Charger\" or \"Free touch-up\"." }}
          error={errors.includesCount} errorKey="includesCount"
          renderRow={(t, i, edit) => (
            <Field name={`inc-${i}`} label={`Included item ${i + 1}`} area="includes" max={inc.text} value={t} error={errors.includes?.[i]} onChange={(e) => edit(() => e.target.value)} />
          )}
        />
      </div>

      <div className={styles.grid}>
        <Field name="packSize" label="Pack size (optional)" area="pack" max={LIMITS.packSize} value={form.packSize} error={errors.packSize} onChange={(e) => patch("packSize", e.target.value)} autoComplete="off"
          hint="What one purchase contains, such as 6 pieces or 500 ml." />
      </div>
      <Field name="terms" as="textarea" label="Terms (optional)" area="terms" max={LIMITS.terms} value={form.terms} error={errors.terms} onChange={(e) => patch("terms", e.target.value)}
        hint="Anything customers should know first, such as a deposit, delivery time or returns." />
    </SectionCard>
  );
}
