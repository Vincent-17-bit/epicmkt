import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { rowChoices } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import TypePicker from "./editor/steps/TypePicker.jsx";
import { useProductTypes } from "./editor/steps/useProductTypes.js";
import { pickerAvailable, recentTypeIds, requestType } from "./AddItem.data.js";
import { MAX_ROWS, blankRow, cellOf, columnsFor, isBlank, parsePaste, pasteInto, rowFields, rowProblems, withCell } from "./tableAdd.js";
import styles from "./TableAdd.module.css";

const CATALOG = "/business/catalog";
const START_ROWS = 5;

/** Many of the same kind: one row per item. Type the rows or paste them from a spreadsheet; every row is checked, then saved. */
export default function TableAdd() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? "";
  const { categoryId, types, departments, loading, error, retry } = useProductTypes();
  const [type, setType] = useState(null);

  if (!pickerAvailable()) return <Navigate to={`${CATALOG}/add`} replace />;
  return (
    <main className={styles.page}>
      <Link className={styles.back} to={`${CATALOG}/add`} state={{ from }}>Back to Add items</Link>
      <h1 className={styles.title}>Add many of the same kind</h1>
      {type ? (
        <Grid type={type} onChange={() => setType(null)} onDone={(notice) => navigate(`${CATALOG}${from}`, { state: { notice } })} />
      ) : loading ? <p role="status">Loading</p> : error ? (
        <div role="alert"><p>We could not load the list of types.</p><button type="button" className={styles.btn} onClick={retry}>Try again</button></div>
      ) : (
        <>
          <p className={styles.lead}>Pick the kind of item. The table gets a column for each detail it needs.</p>
          <TypePicker autoFocus types={types} departments={departments} categoryId={categoryId} recentIds={[]} onPick={setType} onRequestType={requestType} onOther={() => navigate(`${CATALOG}/new`)} />
        </>
      )}
    </main>
  );
}

export function Grid({ type, onChange, onDone }) {
  const columns = columnsFor(type);
  const [rows, setRows] = useState(() => Array.from({ length: START_ROWS }, blankRow));
  const [serverErrors, setServerErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const cells = useRef(new Map());

  const focusCell = (r, c) => cells.current.get(`${r}:${c}`)?.focus();
  const set = (r, col, value) => { setRows((all) => all.map((row, i) => (i === r ? withCell(row, col, value) : row))); setServerErrors((e) => ({ ...e, [r]: undefined })); };
  const addRows = (n = START_ROWS) => setRows((all) => [...all, ...Array.from({ length: Math.min(n, MAX_ROWS - all.length) }, blankRow)]);

  const onKey = (e, r, c) => {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      if (r + 1 >= rows.length) addRows(1);
      setTimeout(() => focusCell(r + 1, c), 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(0, r - 1), c);
    } else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value?.length && c + 1 < columns.length) {
      e.preventDefault();
      focusCell(r, c + 1);
    } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0 && c > 0) {
      e.preventDefault();
      focusCell(r, c - 1);
    }
  };
  const onPaste = (e, r, c) => {
    const grid = parsePaste(e.clipboardData.getData("text"));
    if (grid.length === 1 && grid[0].length === 1) return; // one value: the browser's own paste
    e.preventDefault();
    const out = pasteInto(rows, columns, { row: r, col: c }, grid);
    setRows(out.rows);
    setNote(out.cut ? `Pasted. ${out.cut} rows past the ${MAX_ROWS} row limit were left out.` : `Pasted ${grid.length} ${grid.length === 1 ? "row" : "rows"}.`);
  };

  const filled = rows.map((row, i) => ({ row, i })).filter(({ row }) => !isBlank(row));
  const problemsOf = (row, i) => [...rowProblems(row, type), ...(serverErrors[i] ? [serverErrors[i]] : [])];

  const save = async () => {
    setBusy(true);
    setNote("");
    let published = 0;
    let drafts = 0;
    const keep = [];
    const errors = {};
    for (const { row, i } of filled) {
      const problems = rowProblems(row, type);
      const fields = rowFields(row, type);
      try {
        if (problems.length === 0) {
          const check = await api.checkItem(null, fields);
          if (!check.ok) throw Object.assign(new Error(check.issues?.[0]?.code), { code: check.issues?.[0]?.code });
        }
        if (problems.length && row.name.trim().length < 2) { keep.push(row); errors[keep.length - 1] = problems[0]; continue; }
        const id = await api.saveItem(null, problems.length ? { ...fields, priceType: "contact", price: null, specs: fields.specs } : fields);
        if (problems.length === 0) {
          try { await api.bulkItems("show", [id]); published += 1; } catch { drafts += 1; }
        } else drafts += 1;
      } catch (err) {
        keep.push(row);
        errors[keep.length - 1] = errorText(err);
      }
    }
    setBusy(false);
    if (keep.length === 0) {
      onDone({ tone: "ok", text: `${published} added${drafts ? `, ${drafts} saved as drafts to finish` : ""}.` });
      return;
    }
    setRows([...keep, ...Array.from({ length: Math.max(0, START_ROWS - keep.length) }, blankRow)]);
    setServerErrors(errors);
    setNote(`${published + drafts} saved${drafts ? ` (${drafts} as drafts)` : ""}. ${keep.length} ${keep.length === 1 ? "row needs" : "rows need"} your attention.`);
  };

  const bad = filled.filter(({ row, i }) => problemsOf(row, i).length).length;
  return (
    <section aria-labelledby="table-title">
      <div className={styles.bar}>
        <h2 id="table-title" className={styles.h2}>{type.name}</h2>
        <button type="button" className={styles.btn} onClick={onChange}>Change type</button>
      </div>
      <p className={styles.lead}>Type in the cells or paste rows from a spreadsheet. Use the arrow keys or Enter to move. A row with something missing is saved as a draft.</p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.sr}>Items to add</caption>
          <thead>
            <tr><th scope="col" className={styles.num}>#</th>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}<th scope="col">Problems</th></tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const problems = isBlank(row) ? [] : problemsOf(row, r);
              return (
                <tr key={r} data-bad={problems.length > 0 || undefined}>
                  <th scope="row" className={styles.num}>{r + 1}</th>
                  {columns.map((col, c) => {
                    const common = { ref: (el) => (el ? cells.current.set(`${r}:${c}`, el) : cells.current.delete(`${r}:${c}`)), className: styles.cell, value: cellOf(row, col), "aria-label": `${col.label}, row ${r + 1}`, onKeyDown: (e) => onKey(e, r, c), onPaste: (e) => onPaste(e, r, c), "aria-invalid": problems.length ? "true" : undefined };
                    const choices = col.row?.input === "choice" ? rowChoices(col.row) : null;
                    return (
                      <td key={col.key}>
                        {choices ? (
                          <select {...common} onChange={(e) => set(r, col, e.target.value)}><option value="" />{choices.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                        ) : (
                          <input {...common} inputMode={col.kind === "number" ? "numeric" : undefined} autoComplete="off" onChange={(e) => set(r, col, e.target.value)} />
                        )}
                      </td>
                    );
                  })}
                  <td className={styles.problems}>{problems.length ? <span role="note">{problems.join(". ")}</span> : isBlank(row) ? "" : <span className={styles.ok}>Ready</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status" className={styles.note}>{note}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => addRows()} disabled={rows.length >= MAX_ROWS}>Add 5 rows</button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={save} disabled={busy || filled.length === 0}>
          {busy ? "Saving..." : filled.length === 0 ? "Save items" : `Save ${filled.length} ${filled.length === 1 ? "item" : "items"}${bad ? ` (${bad} to finish)` : ""}`}
        </button>
      </div>
    </section>
  );
}
