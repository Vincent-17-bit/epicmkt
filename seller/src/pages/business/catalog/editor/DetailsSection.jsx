import { useMemo, useState } from "react";
import { faBoxOpen, faListCheck, faPlus, faSliders, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SPEC_DEFAULT_GROUP, SPEC_GROUPS, SPEC_LIMITS, PLAIN_SPEC_ROWS, isInfoGroup, isFaqGroup, isBrandGroup, isChoiceSpec, specExample, specKinds, specSuggestions } from "@epicmkt/shared";
import { LIMITS } from "./model.js";
import { Field, RowList, SectionCard } from "./parts.jsx";
import BrandEditor from "./BrandEditor.jsx";
import FaqEditor from "./FaqEditor.jsx";
import IncludePhoto from "./IncludePhoto.jsx";
import ProductInfoEditor from "./ProductInfoEditor.jsx";
import TypeRows from "./TypeRows.jsx";
import { hasTemplate, rowsOf } from "./typedRows.js";
import { specToOption } from "./specOptions.js";
import styles from "./editor.module.css";

const QUICK = 12;

// The quick-add chips: the rows that suit this kind of item first (bread: Weight, Brand, Slices...; a phone: Storage, RAM...),
// the common ones after. "Show all" lists the rest, and another kind can be picked when the guess is wrong.
function SpecQuickAdd({ form, typeName, category, used, full, onAdd }) {
  const auto = useMemo(() => specSuggestions({ typeName, name: form.name, section: form.section, category }), [typeName, form.name, form.section, category]);
  const [kindId, setKindId] = useState("");
  const [all, setAll] = useState(false);
  const kinds = specKinds();
  const picked = kindId ? kinds.find((k) => k.id === kindId) : null;
  const list = picked ? [...picked.rows, ...auto.rows.filter((r) => !picked.rows.some((p) => p.label.toLowerCase() === r.label.toLowerCase()))] : auto.rows;
  const shown = all ? list : list.slice(0, QUICK);
  const kindName = picked?.name ?? auto.kind.name;
  return (
    <div className={styles.quickAdd}>
      <div className={styles.quickHead}>
        <span className={styles.quickTitle}>Quick add for <strong>{kindName}</strong></span>
        <label className={styles.quickKind}>
          <span className={styles.sr}>Show specifications for another kind of item</span>
          <select className={styles.inputSm} value={kindId} onChange={(e) => { setKindId(e.target.value); setAll(false); }} aria-label="Kind of item">
            <option value="">{`Suggested (${auto.kind.name})`}</option>
            {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
      </div>
      <ul className={styles.presets} aria-label="Quick add">
        {shown.map((p) => (
          <li key={p.label}>
            <button type="button" className={styles.chip} disabled={full || used.has(p.label.toLowerCase())} onClick={() => onAdd(p)} title={p.example ? `For example: ${p.example}` : undefined}>
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> {p.label}
            </button>
          </li>
        ))}
      </ul>
      {list.length > QUICK && (
        <button type="button" className={styles.linkBtn} aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${list.length}`}</button>
      )}
    </div>
  );
}

export default function DetailsSection({ form, patch, errors, focusOn, type, more, onMore, category, media = null, goTo = null }) {
  const hl = LIMITS.highlights;
  const inc = LIMITS.includes;
  const plain = form.specs.filter((s) => !isInfoGroup(s.group));
  const info = form.specs.filter((s) => isInfoGroup(s.group));
  const used = new Set(plain.map((s) => String(s.label ?? "").trim().toLowerCase()));
  const specsFull = plain.length >= PLAIN_SPEC_ROWS;
  const typed = hasTemplate(type);
  const quick = typed && !more;
  const { extra } = rowsOf(form, type);
  const [moved, setMoved] = useState("");

  // "What's included" lines and their photos travel together, so moving or removing a line keeps its photo with it.
  const incRows = form.includes.map((text, i) => ({ text, photo: form.includeMedia?.[i] ?? null }));
  const setIncludes = (rows) => {
    patch("includes", rows.map((r) => r.text));
    if (form.includeMedia !== undefined || rows.some((r) => r.photo)) patch("includeMedia", rows.map((r) => r.photo ?? null));
  };

  const addSpec = (p) => {
    focusOn(`spec-${plain.length}-value`);
    patch("specs", [...plain, { group: p.group, label: p.label, value: "" }, ...info]);
  };
  const toOption = (s) => {
    const r = specToOption(form.options, s.label, s.value);
    if (r.error) { setMoved(r.error); return; }
    patch("options", r.options);
    setMoved(`${s.label} is now an option with ${r.count} ${r.count === 1 ? "choice" : "choices"}. Set a price and photo for each in Options.`);
    if (goTo) setTimeout(() => goTo("options"), 0);
  };

  return (
    <SectionCard id="details" title="Details" why="Highlights, specifications and terms answer the questions customers would otherwise message you to ask.">
      {quick ? (
        <>
          <p className={styles.hint}>Only what you need to publish is asked for now.</p>
          <button type="button" className={styles.btnGhost} aria-expanded="false" onClick={onMore}>Add more details</button>
        </>
      ) : (
        <>
          {typed && extra.length > 0 && (
            <div className={styles.subBlock} data-area="typerows">
              <h3 className={styles.subTitle}>More about this {type.name.toLowerCase()}</h3>
              <p className={styles.hint}>Recommended and optional details help customers decide.</p>
              <TypeRows rows={extra} form={form} patch={patch} />
            </div>
          )}
          <div className={styles.subBlock} data-area="highlights">
            <h3 className={styles.subTitle}>About this item</h3>
            <p className={styles.hint}>Short selling points, shown as a list near the top of the item page. Give each a bold lead if you like.</p>
            <div className={styles.example}>
              <span className={styles.exampleTag}>Example</span>
              <span>Lead: <em>Freshness guaranteed</em> · Text: <em>Baked every morning and packed at once to stay soft.</em></span>
              <span>Buyers see: <strong>【Freshness guaranteed】</strong>: Baked every morning and packed at once to stay soft.</span>
              <span className={styles.exampleNote}>No need to type bullets, brackets or colons; we add them.</span>
            </div>
            <RowList
              noun={{ key: "hl", label: "Highlight", name: "highlight" }} rows={form.highlights} max={hl.rows} onChange={(v) => patch("highlights", v)} focusOn={focusOn}
              blank={{ title: "", text: "" }} focusFirst={(n) => `hl-${n}-title`} addLabel="Add highlight" addKey="add-highlight" icon={faListCheck}
              empty={{ title: "No highlights yet", body: `Add up to ${hl.rows} short points, like "Free delivery in Kisumu" or "Made with real butter".` }}
              error={errors.highlightsCount} errorKey="highlightsCount"
              renderRow={(h, i, edit) => (
                <>
                  <Field name={`hl-${i}-title`} label={`Highlight ${i + 1} title`} area="highlights" max={hl.title} value={h.title} error={errors.highlights?.[i]?.title} placeholder="Freshness guaranteed" onChange={(e) => edit((r) => ({ ...r, title: e.target.value }))} />
                  <Field name={`hl-${i}-text`} as="textarea" label={`Highlight ${i + 1} text`} area="highlights" max={hl.text} value={h.text} error={errors.highlights?.[i]?.text} placeholder="Baked every morning and packed at once to stay soft." onChange={(e) => edit((r) => ({ ...r, text: e.target.value }))} />
                </>
              )}
            />
          </div>

          <div className={styles.subBlock} data-area="specs">
            <h3 className={styles.subTitle}>Specifications</h3>
            <p className={styles.hint}>Facts buyers check before they buy: size, weight, material, what it fits. Tap a suggestion or add your own row; write as much as you need. The <strong>group</strong> decides where the fact shows on the item page (Features & Specs, Measurements, Additional details, User guide or Item details).</p>
            <SpecQuickAdd form={form} typeName={type?.name ?? ""} category={category} used={used} full={specsFull} onAdd={addSpec} />
            {moved && <p className={styles.notice} role="status">{moved}</p>}
            <RowList
              noun={{ key: "spec", label: "Specification", name: "specification" }} rows={plain} max={PLAIN_SPEC_ROWS} onChange={(v) => patch("specs", [...v, ...info])} focusOn={focusOn}
              blank={{ group: SPEC_DEFAULT_GROUP, label: "", value: "" }} focusFirst={() => `spec-${plain.length}-label`} addLabel="Add custom row" addKey="add-spec" icon={faSliders}
              empty={{ title: "No specifications yet", body: "Tap a quick add above, like Weight or Brand, or add your own row." }}
              error={errors.specsCount} errorKey="specsCount"
              renderRow={(s, i, edit) => {
                const choice = isChoiceSpec(s.label) && String(s.value ?? "").trim();
                return (
                  <>
                    <Field name={`spec-${i}-group`} as="select" label="Group" area="specs" value={s.group || SPEC_DEFAULT_GROUP} error={errors.specs?.[i]?.group} onChange={(e) => { focusOn(`spec-${i}-group`); edit((r) => ({ ...r, group: e.target.value })); }}>
                      {SPEC_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </Field>
                    <Field name={`spec-${i}-label`} label="Label" area="specs" maxLength={SPEC_LIMITS.label} value={s.label} error={errors.specs?.[i]?.label} placeholder="Weight" onChange={(e) => edit((r) => ({ ...r, label: e.target.value }))} />
                    <Field name={`spec-${i}-value`} as="textarea" label="Value" area="specs" maxLength={SPEC_LIMITS.value} value={s.value} error={errors.specs?.[i]?.value}
                      placeholder={specExample(s.label) || "Write the fact"} onChange={(e) => edit((r) => ({ ...r, value: e.target.value }))} />
                    {isChoiceSpec(s.label) && (
                      <div className={styles.choiceRow}>
                        <button type="button" className={styles.choiceBtn} disabled={!choice} onClick={() => toOption(s)}>
                          <FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" /> Buyers choose one: price and photo for each
                        </button>
                        <span className={styles.hint}>{choice ? `Turns “${String(s.value).trim().slice(0, 60)}” into choices on the item page, each with its own price, stock and photo.` : "Type the choices with commas first, like Black, Grey, White."}</span>
                      </div>
                    )}
                  </>
                );
              }}
            />
          </div>

          <ProductInfoEditor specs={form.specs} onChange={(next) => patch("specs", next)} plainCount={plain.length} category={category} typeId={form.productTypeId} name={form.name} />

          <BrandEditor specs={form.specs} onChange={(next) => patch("specs", next)} focusOn={focusOn} usedElsewhere={form.specs.filter((s) => !isBrandGroup(s.group)).length} />

          <FaqEditor specs={form.specs} onChange={(next) => patch("specs", next)} focusOn={focusOn} usedElsewhere={form.specs.filter((s) => !isFaqGroup(s.group)).length} />

          <div className={styles.subBlock} data-area="includes">
            <h3 className={styles.subTitle}>What is included</h3>
            <p className={styles.hint}>Everything that comes with one purchase or booking, one line each. A photo per line is optional: buyers see it next to the line.</p>
            <RowList
              noun={{ key: "inc", label: "Included item", name: "included item" }} rows={incRows} max={inc.rows} onChange={setIncludes} focusOn={focusOn}
              blank={{ text: "", photo: null }} focusFirst={(n) => `inc-${n}`} addLabel="Add included item" addKey="add-include" icon={faBoxOpen}
              empty={{ title: "Nothing listed yet", body: "Add what is in the box or the booking, like \"1 x 400 g loaf in a sealed bag\", \"Charger\" or \"Free touch-up\"." }}
              error={errors.includesCount} errorKey="includesCount"
              renderRow={(t, i, edit) => (
                <div className={styles.incRow}>
                  <IncludePhoto media={media} photo={t.photo} label={t.text || `Included item ${i + 1}`} onChange={(photo) => edit((r) => ({ ...r, photo }))} />
                  <Field name={`inc-${i}`} as="textarea" label={`Included item ${i + 1}`} area="includes" max={inc.text} value={t.text} error={errors.includes?.[i]} placeholder="1 x White bread loaf (400 g) in a breathable, twist-tied bag" onChange={(e) => edit((r) => ({ ...r, text: e.target.value }))} />
                </div>
              )}
            />
          </div>

          <div className={styles.grid}>
            <Field name="packSize" label="Pack size (optional)" area="pack" max={LIMITS.packSize} value={form.packSize} error={errors.packSize} onChange={(e) => patch("packSize", e.target.value)} autoComplete="off"
              placeholder="About 16 to 18 slices" hint="What one purchase contains, such as 6 pieces, 500 ml or about 16 slices." />
          </div>
          <Field name="terms" as="textarea" label="Terms and notes (optional)" area="terms" max={LIMITS.terms} value={form.terms} error={errors.terms} onChange={(e) => patch("terms", e.target.value)}
            placeholder="Fresh food cannot be returned. If it arrives damaged we replace it or refund you in full."
            hint="Anything customers should know first, such as a deposit, delivery time, returns or warranty. Shown under Terms and notes." />
        </>
      )}
    </SectionCard>
  );
}
