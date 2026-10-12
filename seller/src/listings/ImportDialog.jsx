import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IMPORT_FIELDS, IMPORT_LIMITS, canImport, errorReportCsv, importProblem, readTable, validateImport } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { useDefaults } from "../lib/useDefaults.js";
import Dialog from "./Dialog.jsx";
import styles from "./listings.module.css";

const message = (error) => {
  const code = String(error?.code ?? error?.message ?? "");
  if (code.startsWith("limit_reached")) return "This would go over your plan limit, so nothing was imported.";
  if (code.startsWith("premium_only")) return "Import is part of the Premium plan.";
  if (code.startsWith("invalid_row")) return `Row ${code.split(":")[1]} was refused by the server, so nothing was imported.`;
  return "The import did not go through and nothing was imported. Try again.";
};

function Locked({ onClose }) {
  return (
    <div className={styles.form}>
      <p>Paste and CSV import is part of the Premium plan. Upgrade to add up to {IMPORT_LIMITS.maxRows} items in one go from Excel or Google Sheets.</p>
      <div className={styles.emptyActions}>
        <Link to="/subscription" className={styles.primaryBtn} onClick={onClose}>See Premium</Link>
        <button type="button" className={styles.secondaryBtn} onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}

function Body({ plan, stats, onClose, onImported }) {
  const defaultAvailability = useDefaults().itemDefaults.availability;
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const capacity = stats?.items_limit === null || stats?.items_limit === undefined ? Infinity : Math.max(0, stats.items_limit - (stats.total ?? 0));
  const check = useMemo(() => (table ? validateImport(table.rows, mapping, { capacity, defaults: { availability: defaultAvailability } }) : null), [table, mapping, capacity, defaultAvailability]);
  const problem = table ? importProblem(mapping) : null;

  const read = (source) => {
    const result = readTable(source);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setTable(result);
    setMapping(result.mapping);
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) {
      setError("That file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    read(await file.text());
  };

  const download = () => {
    const csv = errorReportCsv(check.rejected, table.headers);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.importItems(check.items);
      onImported(result.imported);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canImport(plan)) return <Locked onClose={onClose} />;

  if (!table) {
    return (
      <div className={styles.form}>
        <div className={styles.tabs} role="tablist" aria-label="Import method">
          <button type="button" role="tab" aria-selected={tab === "paste"} className={styles.tab} onClick={() => setTab("paste")}>Paste from a sheet</button>
          <button type="button" role="tab" aria-selected={tab === "file"} className={styles.tab} onClick={() => setTab("file")}>Upload a CSV</button>
        </div>
        {tab === "paste" ? (
          <>
            <label className={styles.field}>
              <span>Paste rows copied from Excel or Google Sheets</span>
              <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Name\tPrice\tUnit\tSection\nFade cut\t600\tcut\tCuts"} />
            </label>
            <button type="button" className={styles.primaryBtn} onClick={() => read(text)} disabled={!text.trim()}>Read rows</button>
          </>
        ) : (
          <label className={styles.field}>
            <span>Choose a CSV file (up to 2 MB and {IMPORT_LIMITS.maxRows} rows)</span>
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} />
          </label>
        )}
        <p className={styles.muted}>Columns we understand: {IMPORT_FIELDS.map((f) => f.label).join(", ")}. Cells starting with = + - or @ are refused.</p>
        <p className={styles.error} role="alert">{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.group}>
        <legend>Match your columns</legend>
        <div className={styles.mapGrid}>
          {IMPORT_FIELDS.map((f) => (
            <label key={f.key} className={styles.field}>
              <span>{f.label}{f.required ? " (required)" : ""}</span>
              <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                <option value="">Not in my data</option>
                {table.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {!problem && check && (
        <>
          <p role="status" data-testid="import-summary">
            {check.valid.length} ready to import, {check.rejected.length} refused.
            {check.overLimit > 0 ? ` ${check.overLimit} ${check.overLimit === 1 ? "row is" : "rows are"} over your plan limit and will not be imported.` : ""}
          </p>
          <div className={styles.tableWrap} data-tall="true">
            <table className={styles.table}>
              <caption className={styles.srOnly}>Rows to import</caption>
              <thead><tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Price</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {check.results.map((r) => (
                  <tr key={r.row} data-ok={r.ok ? "true" : "false"}>
                    <th scope="row">{r.row}</th>
                    <td>{r.ok ? r.item.name : r.raw?.name}</td>
                    <td>{r.ok ? (r.item.price === null ? r.item.price_type : r.item.price) : r.raw?.price}</td>
                    <td>{r.ok ? "Ready" : r.errors.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={styles.muted}>Imported items are saved as hidden drafts. Review them, then show them to customers.</p>
      <p className={styles.error} role="alert">{error}</p>
      <div className={styles.emptyActions}>
        <button type="button" className={styles.primaryBtn} onClick={run} disabled={busy || Boolean(problem) || !check || check.valid.length === 0}>
          Import {check ? check.valid.length : 0} {check?.valid.length === 1 ? "item" : "items"}
        </button>
        {check && check.rejected.length > 0 && <button type="button" className={styles.secondaryBtn} onClick={download}>Download error report</button>}
        <button type="button" className={styles.secondaryBtn} onClick={() => { setTable(null); setError(""); }}>Start over</button>
      </div>
    </div>
  );
}

export default function ImportDialog({ open, onClose, plan, stats, onImported }) {
  return (
    <Dialog open={open} onClose={onClose} title="Import items" wide>
      <Body plan={plan} stats={stats} onClose={onClose} onImported={onImported} />
    </Dialog>
  );
}
