/** The centred card every sign-in screen sits in. */
export default function AuthShell({ title, lead, notice, children, wide = false }) {
  return (
    <main className="auth-page">
      <div className={`auth-card ${wide ? "auth-card--wide" : ""}`}>
        <div className="auth-brand"><span className="sidebar__logo" aria-hidden="true">E</span><span><strong>EpicMKT</strong><small>Admin</small></span></div>
        <h1 className="auth-title">{title}</h1>
        {lead ? <p className="auth-lead">{lead}</p> : null}
        {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
        {children}
      </div>
    </main>
  );
}
