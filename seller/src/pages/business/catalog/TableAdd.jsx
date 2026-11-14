import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import { useProductTypes } from "./editor/steps/useProductTypes.js";
import { MAX_ROWS, applyPaste, columnsFor, emptyRow, isBlank, nextCell, parsePaste, rowItem, rowProblems } from "./tableAdd.js";
import styles from "./TableAdd.module.css";

const CATALOG = "/business/catalog";
const startRows = () => Array.from({ length: 5 }, emptyRow);

export default function TableAdd() {
  const location = useLocation();
  const qc = useQueryClient();
  const { types, loading } = useProductTypes();
  const [typeId, setTypeId] = useState(location.state?.productTypeId ?? "");
  const type = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const columns = useMemo(() => columnsFor(type), [type]);
  const [rows, setRows] = useState(startRows);
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState(null);
  const cells = useRef(new Map());

  const focusCell = (r, c) => cells.current.get(`${r}:${c}`)?.focus();
  const setCell = (id, key, value) => setRows((rs) => rs.map((row) => (row.id === id ? { ...row, cells: { ...row.cells, [key]: value } } : row)));

  const onKeyDown = (e, r, c) => {
    const el = e.currentTarget;
    const edge = { start: el.selectionStart === 0 && el.selectionEnd === 0, end: el.selectionStart === el.value.length };
    if (e.key === "Enter" && r === rows.length - 1 && rows.length < MAX_ROWS) {
      e.preventDefault();
      setRows((rs) => [...rs, emptyRow()]);
      setTimeout(() => focusCell(r + 1, c), 0);
      return;
    }
    const to = nextCell(e.key, { r, c }, { rows: rows.length, cols: columns.length }, edge);
    if (to) {
      e.preventDefault();
      focusCell(to.r, to.c);
    }
  };

  const onPaste = (e, r, c) => {
    const matrix = parsePaste(e.clipboardData.getData("text"));
    if (matrix.length === 1 && matrix[0].length === 1) return;
    e.preventDefault();
    const out = applyPaste(rows, columns, r, c, matrix);
    setRows(out.rows);
    setNotice(out.dropped ? `Only ${MAX_ROWS} rows fit. ${out.dropped} pasted ${out.dropped === 1 ? "row was" : "rows were"} left out.` : `${matrix.length} ${matrix.length === 1 ? "row" : "rows"} pasted.`);
  };

  const save = async () => {
    setBusy(true);
    setReport(null);
    const next = {};
    const publish = [];
    const counts = { published: 0, drafts: 0, errors: 0 };
    for (const row of rows.filter((x) => !isBlank(x))) {
      const { hard, missing } = rowProblems(row, type, columns);
      if (hard.length) { next[row.id] = { state: "error", messages: hard.map((h) => h.message), keys: hard.map((h) => h.key) }; counts.errors += 1; continue; }
      const fields = rowItem(row, type, columns);
      try {
        const check = await api.checkItem(null, fields);
        if (!check.ok) throw new Error((check.issues ?? []).map((i) => i.code).join(", ") || "Not accepted");
        const id = await api.saveItem(null, fields);
        if (row.photo) await api.uploadItemPhoto(id, row.photo).catch(() => { missing.push({ key: "photo", message: "Photo did not upload" }); });
        if (missing.length) { next[row.id] = { state: "draft", messages: missing.map((m) => m.message), keys: missing.map((m) => m.key), id }; counts.drafts += 1; }
        else { publish.push({ rowId: row.id, id }); next[row.id] = { state: "saved", messages: [], keys: [], id }; counts.published += 1; }
      } catch (e) {
        next[row.id] = { state: "error", messages: [errorText(e, "Could not save this row")], keys: [] };
        counts.errors += 1;
      }
    }
    if (publish.length) {
      try { await api.bulkItems("show", publish.map((p) => p.id)); } catch { for (const p of publish) next[p.rowId] = { state: "draft", messages: ["Saved as a draft. Show it from your listings."], keys: [], id: p.id }; counts.drafts += publish.length; counts.published -= publish.length; }
    }
    setStatus(next);
    setReport(counts);
    setRows((rs) => rs.filter((r) => !next[r.id] || next[r.id].state === "error" || isBlank(r)));
    qc.invalidateQueries({ queryKey: ["catalog"] });
    setBusy(false);
  };

  const filled = rows.filter((r) => !isBlank(r)).length;

  return (
    <main className={styles.page}>
      <Link className={styles.back} to={`${CATALOG}/add`}>Back</Link>
      <h1 className={styles.title}>Add many of the same kind</h1>
      <label className={styles.field}>
        <span>Type</span>
        <select className={styles.input} value={typeId} disabled={loading || busy} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Other goods (no type)</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <p className={styles.hint}>Type or paste from a spreadsheet. Arrow keys and Enter move between cells.</p>
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <caption className="sr-only">Items to add, one row per item</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Row</span></th>
              {columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const st = status[row.id];
              return (
                <tr key={row.id} data-state={st?.state}>
                  <th scope="row">{r + 1}</th>
                  {columns.map((col, c) => (
                    <td key={col.key}>
                      {col.kind === "photo" ? (
                        <input type="file" accept="image/*" aria-label={`Photo, row ${r + 1}`} ref={(el) => (el ? cells.current.set(`${r}:${c}`, el) : cells.current.delete(`${r}:${c}`))}
                          onKeyDown={(e) => onKeyDown(e, r, c)} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, photo: e.target.files?.[0] ?? null } : x)))} />
                      ) : (
                        <input className={styles.cell} value={row.cells[col.key] ?? ""} aria-label={`${col.label}, row ${r + 1}`} aria-invalid={st?.keys?.includes(col.key) || undefined}
                          inputMode={col.kind === "price" || col.kind === "stock" ? "numeric" : undefined}
                          ref={(el) => (el ? cells.current.set(`${r}:${c}`, el) : cells.current.delete(`${r}:${c}`))}
                          onChange={(e) => setCell(row.id, col.key, e.target.value)} onKeyDown={(e) => onKeyDown(e, r, c)} onPaste={(e) => onPaste(e, r, c)} />
                      )}
                    </td>
                  ))}
                  <td className={styles.result}>
                    {st?.state === "error" ? <span role="alert">{st.messages.join(". ")}</span> : st?.state === "draft" ? <span>Draft: {st.messages.join(", ")}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status" className={styles.hint}>{notice}</p>
      {report ? (
        <p role="status" className={styles.report}>
          {report.published} added, {report.drafts} saved as {report.drafts === 1 ? "a draft" : "drafts"} to finish, {report.errors} to fix.
          {report.drafts ? <> <Link to={`${CATALOG}/add`}>See items to finish</Link></> : null}
        </p>
      ) : null}
      <div className={styles.row}>
        <button type="button" className={styles.ghost} disabled={busy || rows.length >= MAX_ROWS} onClick={() => setRows((rs) => [...rs, emptyRow()])}>Add a row</button>
        <button type="button" className={styles.primary} disabled={busy || filled === 0} onClick={save}>{busy ? "Saving" : `Save ${filled || ""} ${filled === 1 ? "item" : "items"}`.replace("  ", " ")}</button>
      </div>
    </main>
  );
}
