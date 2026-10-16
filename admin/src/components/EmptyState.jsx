// A friendly "nothing here" block. `action` is an optional { label, onClick }.
export default function EmptyState({ title, children, action, icon = "○" }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action ? <button type="button" className="secondary-button" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  );
}
