import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faChevronLeft, faChevronRight, faClone, faPlus, faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import { GUIDE_COLUMN_IDEAS, GUIDE_LIMITS, addColumn, addRow, canAddColumn, canAddRow, copyRow, moveColumn, moveRow, removeColumn, removeRow, setCell, setHeader } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./guide.module.css";


// The table the seller fills in: one row per size, one column per measurement. The size column is fixed at the start.
// Everything is a plain input, so a phone keyboard, tab and arrow keys all work; rows and columns have their own small buttons.
export default function GuideTable({ guide, kind, onChange, errors = {}, announce }) {
  const uid = useId();
  const free = (GUIDE_COLUMN_IDEAS[kind] ?? GUIDE_COLUMN_IDEAS.custom).filter((n) => !guide.columns.some((c) => c.trim().toLowerCase() === n.toLowerCase()));
  const put = (next, said) => { onChange(next); if (said) announce(said); };
  const focusCell = (id, col) => requestAnimationFrame(() => document.getElementById(`${uid}-${id}-${col}`)?.focus());

  const onKey = (e, r, col) => {
    // Enter moves down a row like a spreadsheet; on the last row it adds one.
    if (e.key !== "Enter") return;
    e.preventDefault();
    const i = guide.rows.findIndex((x) => x.id === r.id);
    const below = guide.rows[i + 1];
    if (below) { focusCell(below.id, col); return; }
    if (!canAddRow(guide)) return;
    const next = addRow(guide);
    onChange(next);
    announce("Row added.");
    focusCell(next.rows[next.rows.length - 1].id, col);
  };

  return (
    <div className={s.tableBlock}>
      <div className={s.scroll} tabIndex={0} role="region" aria-label="Size guide table. Scroll sideways to see every column.">
        <table className={s.table} data-testid="guide-table">
          <caption className={ed.sr}>Your size guide. One row per size.</caption>
          <thead>
            <tr>
              {guide.columns.map((c, i) => {
                const err = errors[`columns.${i}`];
                return (
                  <th key={i} scope="col" className={`${s.th} ${i === 0 ? s.stick : ""}`} data-first={i === 0 ? "" : undefined}>
                    <div className={s.headCell}>
                      <input
                        className={s.headInput} value={c} maxLength={GUIDE_LIMITS.header} autoComplete="off" data-focus={`guide-columns.${i}`}
                        aria-label={i === 0 ? "Name of the size column" : `Name of column ${i + 1}`} aria-invalid={err ? "true" : undefined}
                        aria-describedby={err ? `${uid}-ce-${i}` : undefined} placeholder="Column name"
                        onChange={(e) => onChange(setHeader(guide, i, e.target.value))}
                      />
                      {i > 0 && (
                        <span className={s.headTools}>
                          <button type="button" className={s.mini} aria-label={`Move ${c || `column ${i + 1}`} earlier`} disabled={i === 1} onClick={() => put(moveColumn(guide, i, -1), `${c} moved earlier.`)}><FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /></button>
                          <button type="button" className={s.mini} aria-label={`Move ${c || `column ${i + 1}`} later`} disabled={i === guide.columns.length - 1} onClick={() => put(moveColumn(guide, i, 1), `${c} moved later.`)}><FontAwesomeIcon icon={faChevronRight} aria-hidden="true" /></button>
                          <button type="button" className={`${s.mini} ${s.danger}`} aria-label={`Remove column ${c || i + 1}`} onClick={() => put(removeColumn(guide, i), `${c || "Column"} removed.`)}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button>
                        </span>
                      )}
                    </div>
                    {err && <span id={`${uid}-ce-${i}`} className={s.cellError}>{err}</span>}
                  </th>
                );
              })}
              <th scope="col" className={s.thTools}><span className={ed.sr}>Row actions</span></th>
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((r, ri) => {
              const size = r.cells[0] || `row ${ri + 1}`;
              return (
                <tr key={r.id}>
                  {guide.columns.map((c, ci) => {
                    const err = errors[`rows.${r.id}.${ci}`];
                    return (
                      <td key={ci} className={`${s.td} ${ci === 0 ? s.stick : ""}`}>
                        <input
                          id={`${uid}-${r.id}-${ci}`} className={s.cell} value={r.cells[ci] ?? ""} maxLength={GUIDE_LIMITS.cell} autoComplete="off"
                          inputMode="text" enterKeyHint={ri === guide.rows.length - 1 ? "done" : "next"} data-focus={`guide-rows.${r.id}.${ci}`}
                          aria-label={ci === 0 ? `Size name, row ${ri + 1}` : `${c || `Column ${ci + 1}`} for ${size}`} aria-invalid={err ? "true" : undefined}
                          aria-describedby={err ? `${uid}-e-${r.id}-${ci}` : undefined} placeholder={ci === 0 ? "e.g. M" : "–"}
                          onChange={(e) => onChange(setCell(guide, r.id, ci, e.target.value))} onKeyDown={(e) => onKey(e, r, ci)}
                        />
                        {err && <span id={`${uid}-e-${r.id}-${ci}`} className={s.cellError}>{err}</span>}
                      </td>
                    );
                  })}
                  <td className={s.tdTools}>
                    <span className={s.rowTools}>
                      <button type="button" className={s.mini} aria-label={`Move ${size} up`} disabled={ri === 0} onClick={() => put(moveRow(guide, r.id, -1), `${size} moved up.`)}><FontAwesomeIcon icon={faArrowUp} aria-hidden="true" /></button>
                      <button type="button" className={s.mini} aria-label={`Move ${size} down`} disabled={ri === guide.rows.length - 1} onClick={() => put(moveRow(guide, r.id, 1), `${size} moved down.`)}><FontAwesomeIcon icon={faArrowDown} aria-hidden="true" /></button>
                      <button type="button" className={s.mini} aria-label={`Copy ${size} as a new row`} disabled={!canAddRow(guide)} onClick={() => { const n = copyRow(guide, r.id); put(n, "Row copied. Name the new size."); focusCell(n.rows[ri + 1].id, 0); }}><FontAwesomeIcon icon={faClone} aria-hidden="true" /></button>
                      <button type="button" className={`${s.mini} ${s.danger}`} aria-label={`Remove ${size}`} onClick={() => put(removeRow(guide, r.id), `${size} removed.`)}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {guide.rows.length === 0 && <tr><td className={s.noRows} colSpan={guide.columns.length + 1}>No sizes yet. Add a row for each size you sell.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className={s.count}>Scroll sideways to see every column. The buttons at the end of each row move, copy or remove it.</p>
      {errors.rows && <p className={ed.error} data-focus="guide-rows">{errors.rows}</p>}
      {errors.columns && <p className={ed.error} data-focus="guide-columns">{errors.columns}</p>}

      <div className={s.adders}>
        <button type="button" className={s.pill} disabled={!canAddRow(guide)} onClick={() => { const n = addRow(guide); put(n, "Row added."); focusCell(n.rows[n.rows.length - 1].id, 0); }}>
          <FontAwesomeIcon icon={faPlus} aria-hidden="true" />Add a size
        </button>
        <span className={s.count}>{guide.rows.length} of {GUIDE_LIMITS.rows} sizes</span>
      </div>

      <div className={s.colAdd} role="group" aria-label="Add a column">
        <span className={s.colAddLabel}>Add a column</span>
        <ul className={s.suggest}>
          {free.slice(0, 6).map((n) => (
            <li key={n}><button type="button" className={s.pill} disabled={!canAddColumn(guide)} onClick={() => put(addColumn(guide, n), `${n} column added.`)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />{n}</button></li>
          ))}
          <li><button type="button" className={s.pill} disabled={!canAddColumn(guide)} onClick={() => { const n = addColumn(guide, ""); put(n, "Column added. Name it."); requestAnimationFrame(() => document.querySelector(`[data-focus="guide-columns.${n.columns.length - 1}"]`)?.focus()); }}>Your own</button></li>
        </ul>
        {!canAddColumn(guide) && <p className={s.count}>You can have up to {GUIDE_LIMITS.columns} columns.</p>}
      </div>
    </div>
  );
}
