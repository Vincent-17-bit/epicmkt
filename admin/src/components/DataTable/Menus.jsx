import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookmark, faDownload, faStar, faTableColumns, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Popover } from "./Popover.jsx";
import { deleteView, loadViews, saveView, setDefaultView } from "../../lib/savedViews.js";
import styles from "./DataTable.module.css";

/** Show or hide columns. Locked columns (the name, the row actions) stay on and say so. */
export function ColumnsMenu({ columns, visibleKeys, onChange, onReset }) {
  const toggle = (key) => onChange(visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key]);
  return (
    <Popover label="Choose columns" text="Columns" icon={<FontAwesomeIcon icon={faTableColumns} fixedWidth />}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.panelTitle}>Show columns</legend>
        {columns.filter((c) => c.header && c.chooser !== false).map((c) => (
          <label key={c.key} className={styles.check}>
            <input type="checkbox" checked={c.locked || visibleKeys.includes(c.key)} disabled={c.locked} onChange={() => toggle(c.key)} />
            <span>{c.header}{c.locked ? <span className={styles.hint}> (always shown)</span> : null}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" className={styles.linkButton} onClick={onReset}>Reset to default columns</button>
    </Popover>
  );
}

/** Saved views: apply, set as the one that opens by default, delete, or save the current filters, sort, columns and density. */
export function ViewsMenu({ tableId, scope, snapshot, onApply, onSaved, notify }) {
  const [data, setData] = useState(() => loadViews(tableId, { scope }));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const refresh = () => setData(loadViews(tableId, { scope }));

  const save = (event) => {
    event.preventDefault();
    const result = saveView(tableId, name, snapshot(), { scope });
    if (result.error) { setError(result.error); return; }
    setError(""); setName(""); setData(result.data); onSaved?.(result.view);
    notify?.(`Saved the view "${result.view.name}".`);
  };

  return (
    <Popover label="Saved views" text="Views" icon={<FontAwesomeIcon icon={faBookmark} fixedWidth />} onOpenChange={(open) => { if (open) refresh(); }}>
      {({ close }) => (
        <div className={styles.views}>
          <p className={styles.panelTitle}>Saved views</p>
          {data.views.length === 0 ? <p className={styles.hint}>No saved views yet. Set up the filters and sort you want, then save them below.</p> : (
            <ul className={styles.viewList}>
              {data.views.map((view) => (
                <li key={view.id} className={styles.viewRow}>
                  <button type="button" className={styles.viewName} onClick={() => { onApply(view.state); close(); }}>{view.name}</button>
                  <button type="button" className={styles.iconTool} aria-pressed={data.defaultId === view.id}
                    aria-label={data.defaultId === view.id ? `${view.name} opens by default. Stop opening it by default` : `Open ${view.name} by default`}
                    title={data.defaultId === view.id ? "Opens by default" : "Open by default"}
                    onClick={() => setData(setDefaultView(tableId, data.defaultId === view.id ? null : view.id, { scope }))}>
                    <FontAwesomeIcon icon={faStar} fixedWidth className={data.defaultId === view.id ? styles.starOn : styles.starOff} />
                  </button>
                  <button type="button" className={styles.iconTool} aria-label={`Delete ${view.name}`} title="Delete" onClick={() => setData(deleteView(tableId, view.id, { scope }))}>
                    <FontAwesomeIcon icon={faTrashCan} fixedWidth />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className={styles.saveForm} onSubmit={save}>
            <label className={styles.fieldLabel} htmlFor={`${tableId}-view-name`}>Save the current view as</label>
            <div className={styles.saveRow}>
              <input id={`${tableId}-view-name`} className={styles.textInput} value={name} maxLength={40} placeholder="For example, My overdue" aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${tableId}-view-error` : undefined} onChange={(e) => { setName(e.target.value); setError(""); }} />
              <button type="submit" className={styles.solidButton}>Save</button>
            </div>
            {error ? <p id={`${tableId}-view-error`} className={styles.error} role="alert">{error}</p> : null}
            <p className={styles.hint}>Views stay in this browser. They remember filters, sort, columns and density, not the search text.</p>
          </form>
        </div>
      )}
    </Popover>
  );
}

/** CSV export of this page, or of everything that matches the current search and filters. */
export function ExportMenu({ pageCount, total, onExportPage, onExportAll, busy }) {
  return (
    <Popover label="Export to CSV" text="Export" icon={<FontAwesomeIcon icon={faDownload} fixedWidth />}>
      {({ close }) => (
        <div className={styles.menu}>
          <p className={styles.panelTitle}>Export to CSV</p>
          <button type="button" className={styles.menuItem} disabled={pageCount === 0} onClick={() => { onExportPage(); close(); }}>
            This page <span className={styles.hint}>{pageCount} {pageCount === 1 ? "row" : "rows"}</span>
          </button>
          {onExportAll ? (
            <button type="button" className={styles.menuItem} disabled={total === 0 || busy} onClick={() => { onExportAll(); close(); }}>
              Everything that matches <span className={styles.hint}>{total} {total === 1 ? "row" : "rows"}</span>
            </button>
          ) : null}
          <p className={styles.hint}>Includes every column, even the ones hidden on screen.</p>
        </div>
      )}
    </Popover>
  );
}
