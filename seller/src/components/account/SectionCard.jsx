import { fmtDateTime, LockChip, PremiumChip } from "./ui.jsx";

/**
 * The shell every section uses: title, Edit, body (read view or editor), Save / Cancel, "Last updated".
 */
export default function SectionCard({
  id, title, description, locked = false, premium = false, lastUpdated, neverLabel = "Not edited yet",
  editing, onEdit, onCancel, onSave, canSave = true, saving = false, error = "",
  editDisabled = false, editHint, status, saveLabel = "Save", children, footerNote,
}) {
  return (
    <section className="sx-card" id={id} aria-labelledby={`${id}-title`}>
      <header className="sx-card__head">
        <div>
          <h2 id={`${id}-title`}>
            {title} {locked && <LockChip />} {premium && <PremiumChip />}
          </h2>
          {description && <p className="sx-muted">{description}</p>}
        </div>
        {!editing && onEdit && (
          <button type="button" className="sx-btn" onClick={onEdit} disabled={editDisabled} aria-label={`Edit ${title}`} title={editDisabled ? editHint : undefined}>Edit</button>
        )}
      </header>
      {status}
      <div className="sx-card__body">{children}</div>
      {error && <p className="sx-error" role="alert">{error}</p>}
      {editing && (
        <footer className="sx-card__foot">
          {footerNote && <p className="sx-hint">{footerNote}</p>}
          <div className="sx-row sx-row--end">
            <button type="button" className="sx-btn" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="button" className="sx-btn sx-btn--primary" onClick={onSave} disabled={!canSave || saving}>{saving ? "Saving…" : saveLabel}</button>
          </div>
        </footer>
      )}
      <p className="sx-card__meta">Last updated: {lastUpdated ? fmtDateTime(lastUpdated) : neverLabel}</p>
    </section>
  );
}
