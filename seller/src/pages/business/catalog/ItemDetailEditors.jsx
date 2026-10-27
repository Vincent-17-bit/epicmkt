import { ITEM_DETAIL_LIMITS, SPEC_DEFAULT_GROUP, SPEC_GROUPS, SPEC_LIMITS, SPEC_PRESETS } from "@epicmkt/shared";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

export function Field({ label, error, counter, note, id, children }) {
  return (
    <div className={ui.field}>
      <label className={styles.stack}>
        <span className={ui.label}>{label}</span>
        {children}
      </label>
      {note && (
        <span id={id} className={styles.noteRow}>
          <span className={styles.hint}>{note}</span>
          {counter && <span className={styles.counter} aria-hidden="true">{counter}</span>}
        </span>
      )}
      {((error) || (counter && !note)) && (
        <div className={styles.fieldMeta}>
          {error && <span className={ui.error} role="alert">{error}</span>}
          {counter && !note && <span className={styles.counter}>{counter}</span>}
        </div>
      )}
    </div>
  );
}

const Anchor = ({ children }) => <p className={ui.error} role="alert" tabIndex={-1} data-anchor="error">{children}</p>;

export function HighlightsEditor({ rows, errors, countError, onField, onAdd, onMove, onRemove }) {
  return (
    <>
      <div className={styles.listTop}>
        <p className={styles.hint}>Optional. Up to {ITEM_DETAIL_LIMITS.highlights.rows} short points that sell the item. A title is optional and shows in bold before the text.</p>
        <span className={styles.counter}>{rows.length} of {ITEM_DETAIL_LIMITS.highlights.rows}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r._k} className={styles.stockBox} role="group" aria-label={`Highlight ${i + 1}`}>
          <Field label={`Highlight ${i + 1} title`} error={errors?.[i]?.title}>
            <input className={ui.input} data-focus={`h-${r._k}-title`} value={r.title} onChange={onField(i, "title")} aria-invalid={Boolean(errors?.[i]?.title)} maxLength={ITEM_DETAIL_LIMITS.highlights.title} />
          </Field>
          <Field label={`Highlight ${i + 1} text`} error={errors?.[i]?.text}>
            <textarea className={ui.input} data-focus={`h-${r._k}-text`} value={r.text} onChange={onField(i, "text")} aria-invalid={Boolean(errors?.[i]?.text)} maxLength={ITEM_DETAIL_LIMITS.highlights.text} />
          </Field>
          <div className={styles.rowActions}>
            <button type="button" className={styles.rowBtn} onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move up (highlight ${i + 1})`}>Move up</button>
            <button type="button" className={styles.rowBtn} onClick={() => onMove(i, 1)} disabled={i === rows.length - 1} aria-label={`Move down (highlight ${i + 1})`}>Move down</button>
            <button type="button" className={styles.rowBtn} onClick={() => onRemove(i)} aria-label={`Remove highlight ${i + 1}`}>Remove</button>
          </div>
        </div>
      ))}
      {countError && <Anchor>{countError}</Anchor>}
      <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={onAdd} disabled={rows.length >= ITEM_DETAIL_LIMITS.highlights.rows}>Add highlight</button>
    </>
  );
}

const groupOf = (row) => (SPEC_GROUPS.includes(row.group) ? row.group : SPEC_DEFAULT_GROUP);

export function SpecsEditor({ rows, errors, countError, onField, onPreset, onAdd, onRemove }) {
  const used = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  const full = rows.length >= SPEC_LIMITS.rows;
  const groups = SPEC_GROUPS.map((name) => ({ name, rows: rows.map((row, i) => ({ row, i })).filter(({ row }) => groupOf(row) === name) })).filter((g) => g.rows.length > 0);
  return (
    <>
      <div className={styles.listTop}>
        <p className={styles.hint}>Optional. Add short facts about this item, such as Size or Material. The group decides which section of the item page each fact appears under. Tap a common fact to add it.</p>
        <span className={styles.counter}>{rows.length} of {SPEC_LIMITS.rows}</span>
      </div>
      <ul className={styles.chips} aria-label="Common specifications">
        {SPEC_PRESETS.map((p) => (
          <li key={p.label}>
            <button type="button" className={styles.presetChip} onClick={() => onPreset(p)} disabled={full || used.has(p.label.toLowerCase())}>{p.label}</button>
          </li>
        ))}
      </ul>
      {groups.map((g) => (
        <div key={g.name} className={styles.specGroup} role="group" aria-label={g.name}>
          <h4 className={styles.specGroupTitle}>{g.name}</h4>
          {g.rows.map(({ row, i }) => (
            <div key={row._k} className={styles.specRow}>
              <Field label="Group" error={errors?.[i]?.group}>
                <select className={ui.input} data-focus={`s-${row._k}-group`} value={groupOf(row)} onChange={onField(i, "group")} aria-invalid={Boolean(errors?.[i]?.group)}>
                  {SPEC_GROUPS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Label" error={errors?.[i]?.label}>
                <input className={ui.input} data-focus={`s-${row._k}-label`} value={row.label} onChange={onField(i, "label")} aria-invalid={Boolean(errors?.[i]?.label)} maxLength={SPEC_LIMITS.label} />
              </Field>
              <Field label="Value" error={errors?.[i]?.value}>
                <input className={ui.input} data-focus={`s-${row._k}-value`} value={row.value} onChange={onField(i, "value")} aria-invalid={Boolean(errors?.[i]?.value)} maxLength={SPEC_LIMITS.value} />
              </Field>
              <div className={styles.rowActions}>
                <button type="button" className={styles.rowBtn} onClick={() => onRemove(i)} aria-label={`Remove specification ${i + 1}`}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {countError && <Anchor>{countError}</Anchor>}
      <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={onAdd} disabled={full}>Add custom row</button>
    </>
  );
}

export function IncludesEditor({ rows, errors, countError, onField, onAdd, onRemove }) {
  return (
    <>
      <div className={styles.listTop}>
        <p className={styles.hint}>Optional. List what comes with the item, such as a charger or a gift box. Up to {ITEM_DETAIL_LIMITS.includes.rows} lines.</p>
        <span className={styles.counter}>{rows.length} of {ITEM_DETAIL_LIMITS.includes.rows}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r._k} className={ui.field}>
          <div className={styles.includeRow}>
            <label className={styles.stack}>
              <span className={ui.label}>{`Included item ${i + 1}`}</span>
              <input className={ui.input} data-focus={`i-${r._k}-text`} value={r.text} onChange={onField(i)} aria-invalid={Boolean(errors?.[i])} maxLength={ITEM_DETAIL_LIMITS.includes.text} />
            </label>
            <button type="button" className={styles.rowBtn} onClick={() => onRemove(i)} aria-label={`Remove included item ${i + 1}`}>Remove</button>
          </div>
          {errors?.[i] && <span className={ui.error} role="alert">{errors[i]}</span>}
        </div>
      ))}
      {countError && <Anchor>{countError}</Anchor>}
      <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={onAdd} disabled={rows.length >= ITEM_DETAIL_LIMITS.includes.rows}>Add included item</button>
    </>
  );
}

export function PhotosEditor({ tiles, busy, uploading, accept, note, errors, onPick, onMove }) {
  return (
    <fieldset className={styles.photos}>
      <legend className={styles.sr}>Photos</legend>
      {tiles.length > 0 && (
        <ul className={styles.photoList}>
          {tiles.map((t, i) => (
            <li key={t.key} className={styles.photoRow}>
              <span className={styles.photoThumb}>
                {t.src ? <img src={t.src} alt="" /> : <span className={styles.photoBlank} aria-hidden="true" />}
                {i === 0 && <span className={styles.photoCover}>Cover</span>}
              </span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.rowBtn} onClick={() => onMove(i, -1)} disabled={busy || i === 0} aria-label={`Move earlier (photo ${i + 1})`}>Move earlier</button>
                <button type="button" className={styles.rowBtn} onClick={() => onMove(i, 1)} disabled={busy || i === tiles.length - 1} aria-label={`Move later (photo ${i + 1})`}>Move later</button>
                <button type="button" className={styles.rowBtn} onClick={t.remove} disabled={busy} aria-label={`Remove photo ${i + 1}`}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className={`${styles.ghost} ${styles.photoAdd}`}>
        <input type="file" accept={accept} multiple className={styles.sr} onChange={onPick} disabled={busy} />
        <span>{uploading ? "Working..." : "Add photos"}</span>
      </label>
      <p className={styles.hint}>{note}</p>
      {errors.map((m) => <p key={m} className={ui.error} role="alert">{m}</p>)}
    </fieldset>
  );
}
