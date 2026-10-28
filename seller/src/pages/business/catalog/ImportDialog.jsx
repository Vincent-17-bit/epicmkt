import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IMPORT_FIELDS, IMPORT_LABELS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_SPEC_HINT, IMPORT_TEMPLATE, checkImportFile, detectMapping, errorReportCsv,
  parseDelimited, positionalMapping, toImportPayload, validateImport,
} from "@epicmkt/shared";
import Modal from "./Modal.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const columnLabel = (rows, hasHeader, i) => (hasHeader && rows[0]?.[i] ? rows[0][i] : `Column ${i + 1}`);

export default function ImportDialog({ open, premium, remaining, onClose, onImport }) {
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const result = useMemo(
    () => (parsed && mapping ? validateImport(parsed.rows, mapping, { hasHeader, premium, remaining }) : null),
    [parsed, mapping, hasHeader, premium, remaining],
  );

  const reset = () => {
    setParsed(null);
    setMapping(null);
    setError("");
  };

  const load = (raw) => {
    if (new Blob([raw]).size > IMPORT_MAX_BYTES) return setError("That is over 2 MB. Split it into smaller parts.");
    const out = parseDelimited(raw);
    if (out.rows.length === 0) return setError("No rows found. Paste your rows or choose another file.");
    const found = detectMapping(out.rows[0]);
    setParsed(out);
    setHasHeader(found.hasHeader);
    setMapping(found.hasHeader ? found.mapping : positionalMapping(out.rows[0].length));
    setError("");
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = checkImportFile(file);
    if (!check.ok) return setError(check.message);
    load(await file.text());
  };

  const toggleHeader = (checked) => {
    setHasHeader(checked);
    if (parsed) setMapping(checked ? detectMapping(parsed.rows[0]).mapping : positionalMapping(parsed.rows[0].length));
  };

  const download = () => {
    const headers = hasHeader ? parsed.rows[0] : [];
    const blob = new Blob([errorReportCsv(result.rejected, headers)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await onImport(toImportPayload(result.valid));
      setText("");
      reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  if (!premium) {
    return (
      <Modal open={open} onClose={close} title="Import items" labelId="import-title">
        <div className={`${ui.banner} ${ui.tone_info}`} data-testid="import-locked">
          <h2>Import is part of Premium</h2>
          <p>Paste rows from Excel or Google Sheets, or upload a CSV, to add up to {IMPORT_MAX_ROWS} items at once. Upgrade to Premium to use it.</p>
          <p><Link className={ui.link} to="/business/subscription" onClick={close}>See plans and upgrade</Link></p>
        </div>
      </Modal>
    );
  }

  const canImport = result && !result.locked && !result.tooMany && result.valid.length > 0 && !busy;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import items"
      labelId="import-title"
      wide
      footer={
        <>
          {parsed && <button type="button" className={styles.ghost} onClick={reset}>Start over</button>}
          <button type="button" className={styles.ghost} onClick={close}>Cancel</button>
          {parsed && <button type="button" className={styles.primary} disabled={!canImport} onClick={run}>{result?.valid.length ? `Import ${result.valid.length} ${result.valid.length === 1 ? "item" : "items"}` : "Import"}</button>}
        </>
      }
    >
      {!parsed && (
        <div className={styles.importInput}>
          <div role="tablist" className={styles.tabs} aria-label="Import method">
            <button type="button" role="tab" aria-selected={tab === "paste"} className={styles.tab} onClick={() => setTab("paste")}>Paste rows</button>
            <button type="button" role="tab" aria-selected={tab === "csv"} className={styles.tab} onClick={() => setTab("csv")}>Upload CSV</button>
          </div>
          <p className={styles.hint}>Columns: {IMPORT_TEMPLATE.split("\t").join(", ")}. {IMPORT_SPEC_HINT} Up to {IMPORT_MAX_ROWS} rows and 2 MB. Imported items are saved as drafts, so nothing shows to customers until you choose Show.</p>
          {tab === "paste" ? (
            <>
              <textarea className={ui.input} rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Paste rows" placeholder="Copy cells from Excel or Google Sheets and paste here" />
              <button type="button" className={styles.primary} disabled={!text.trim()} onClick={() => load(text)}>Preview</button>
            </>
          ) : (
            <label className={ui.field}>
              <span className={ui.label}>CSV file</span>
              <input className={ui.input} type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} aria-label="CSV file" />
            </label>
          )}
          {error && <p className={ui.error} role="alert">{error}</p>}
        </div>
      )}
      {parsed && mapping && (
        <div className={styles.importReview}>
          <label className={styles.check}>
            <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
            <span>First row is a header</span>
          </label>
          <div className={styles.mapGrid}>
            {IMPORT_FIELDS.map((f) => (
              <label key={f} className={styles.stack}>
                <span>{IMPORT_LABELS[f]}{f === "name" ? " (required)" : ""}</span>
                <select
                  className={styles.select}
                  value={mapping[f] ?? ""}
                  aria-label={`${IMPORT_LABELS[f]} column`}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === "" ? null : Number(e.target.value) }))}
                >
                  <option value="">Not used</option>
                  {Array.from({ length: Math.max(...parsed.rows.map((r) => r.length)) }, (_, i) => <option key={i} value={i}>{columnLabel(parsed.rows, hasHeader, i)}</option>)}
                </select>
              </label>
            ))}
          </div>
          {mapping.specs?.length > 0 && (
            <p className={styles.hint} data-testid="import-spec-columns">
              Specification columns found: {mapping.specs.map((c) => `${c.label} (${c.group})`).join(", ")}.
            </p>
          )}
          {result?.message && <p className={ui.error} role="alert">{result.message}</p>}
          {result && !result.message && (
            <p data-testid="import-summary" className={styles.summaryText}>
              {result.valid.length} ready to import, {result.rejected.length} rejected, {result.total} rows in total.
            </p>
          )}
          {result && result.rejected.length > 0 && (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="import-rejected">
                  <thead><tr><th>Row</th><th>Problem</th></tr></thead>
                  <tbody>{result.rejected.slice(0, 100).map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.errors.join(" ")}</td></tr>)}</tbody>
                </table>
              </div>
              {result.rejected.length > 100 && <p className={styles.hint}>Showing the first 100. The error report has all {result.rejected.length}.</p>}
              <button type="button" className={styles.ghost} onClick={download}>Download error report</button>
            </>
          )}
          {error && <p className={ui.error} role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
