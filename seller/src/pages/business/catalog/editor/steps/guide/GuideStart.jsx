import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRulerCombined, faShoePrints, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { GUIDE_KINDS, GUIDE_TEMPLATES, guideFromChart, kindLabel, startGuide } from "@epicmkt/shared";
import ShoePanel from "./ShoePanel.jsx";
import s from "./guide.module.css";

const ONE_SIZE = "Standard"; // the row of an item that comes in one size only

const Templates = ({ list, sizes, kind, onStart }) => (
  <ul className={s.tplList}>
    {list.map((t) => (
      <li key={t.id}>
        <button
          type="button" className={s.tpl}
          onClick={() => onStart(startGuide({ ...t, sizes: sizes.length || t.kind === "custom" || t.kind === "clothing" ? sizes : [ONE_SIZE] }), t.fill && sizes.length ? "Amounts were read from your size names. Check them and fill in the rest." : "")}
        >
          <strong>{t.name}</strong>
          <span>{t.columns.slice(1).join(" · ")}</span>
        </button>
      </li>
    ))}
  </ul>
);

// The first thing a seller sees: pick how to begin. The tables for this kind of item come first; every other kind is one tap away.
// Shoe conversion is shown first only for shoes, so a bakery or a liquor store never sees it unless they open "Other kinds of table".
export default function GuideStart({ kind, sizes, charts, chartsState, onStart, goOptions }) {
  const shoe = kind === "shoe";
  const info = GUIDE_KINDS.find((k) => k.id === kind);
  const mine = GUIDE_TEMPLATES.filter((t) => t.kind === kind);
  const rest = GUIDE_TEMPLATES.filter((t) => t.kind !== kind && t.kind !== "custom");
  const plain = GUIDE_TEMPLATES.find((t) => t.id === "plain");
  const groups = GUIDE_KINDS.filter((k) => k.id !== kind && k.id !== "shoe");

  // The admin's ready-made tables are clothing and shoe tables: up front for those (and for an unknown kind), tucked under "Other kinds" for the rest.
  const upfront = !kind || kind === "shoe" || kind === "clothing" || kind === "custom";
  const ready = (
      <div className={s.panel}>
        <p className={s.panelTitle}><FontAwesomeIcon icon={faTableCells} aria-hidden="true" /> Or copy a ready-made table</p>
        {chartsState === "loading" && <p className={s.muted} role="status">Loading ready-made tables…</p>}
        {chartsState === "error" && <p className={s.muted}>We could not load the ready-made tables. You can still use the options above.</p>}
        {chartsState === "ready" && charts.length === 0 && <p className={s.muted}>There are no ready-made tables yet.</p>}
        {chartsState === "ready" && charts.length > 0 && (
          <ul className={s.tplList}>
            {charts.map((c) => (
              <li key={c.id}>
                <button type="button" className={s.tpl} onClick={() => onStart(guideFromChart(c), "It is your own copy now. Change any number to fit your item.")}>
                  <strong>{c.name}</strong>
                  <span>{c.columns.slice(1, 5).join(" · ")}{c.unit ? ` · ${c.unit}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
  );

  return (
    <div className={s.start} data-testid="guide-start">
      <div className={s.startHead}>
        <span className={s.startIcon} aria-hidden="true"><FontAwesomeIcon icon={shoe ? faShoePrints : faRulerCombined} /></span>
        <div>
          <p className={s.startTitle}>{info ? `Make your size guide for ${info.label.toLowerCase()}` : "Make your size guide"}</p>
          <p className={s.muted}>{info ? info.about : "Pick the columns that tell a buyer which size to choose."} Buyers open it from a Size chart link next to the sizes. It belongs to this item only.</p>
        </div>
      </div>

      {shoe && <ShoePanel sizes={sizes} onStart={onStart} goOptions={goOptions} />}

      {mine.length > 0 && (
        <div className={s.panel}>
          <p className={s.panelTitle}>Pick the columns to show</p>
          <p className={s.muted}>{sizes.length ? `One row is made for each of your ${sizes.length} sizes (${sizes.slice(0, 4).join(", ")}${sizes.length > 4 ? "…" : ""}). You type the rest.` : kind === "clothing" ? "Then add a row for each size you sell." : "Your item has no sizes listed, so it starts with one row called Standard."}</p>
          <Templates list={mine} sizes={sizes} kind={kind} onStart={onStart} />
        </div>
      )}

      {!shoe && !mine.length && (
        <div className={s.panel}>
          <p className={s.panelTitle}>Start with your own columns</p>
          <p className={s.muted}>Name the columns yourself, for example Length, Weight or Fits. You can add more any time.</p>
          <Templates list={[plain]} sizes={sizes} kind={kind} onStart={onStart} />
        </div>
      )}

      {upfront && ready}

      <details className={s.more}>
        <summary>Other kinds of table</summary>
        <div className={s.moreBody}>
          {!upfront && ready}
          {kind && kind !== "custom" && <Templates list={[plain]} sizes={sizes} kind={kind} onStart={onStart} />}
          {groups.map((g) => (
            <section key={g.id} aria-label={g.label}>
              <p className={s.groupTitle}>{g.label}</p>
              <Templates list={rest.filter((t) => t.kind === g.id)} sizes={sizes} kind={kind} onStart={onStart} />
            </section>
          ))}
          {!shoe && (
            <section aria-label="Shoes">
              <p className={s.groupTitle}>{kindLabel("shoe")}</p>
              <p className={s.muted}>Only for shoes and sandals: it converts EU, UK and US sizes.</p>
              <ShoePanel sizes={sizes} onStart={onStart} goOptions={goOptions} />
            </section>
          )}
        </div>
      </details>
      <p className={s.muted}>No guide needed? Skip this step. Buyers will still pick a size.</p>
    </div>
  );
}
