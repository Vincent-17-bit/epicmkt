// The card the authenticator screens sit in. Same look as the sign-in page.
export default function AuthShell({ title, lead, children }) {
  return (
    <main className="admin-login">
      <div className="admin-login__card">
        <div className="admin-login__brand">
          <div className="admin-login__logo" aria-hidden="true">E</div>
          <div>
            <strong>EpicMKT</strong>
            <span>Admin</span>
          </div>
        </div>
        <h1 className="admin-login__title">{title}</h1>
        {lead ? <p className="admin-login__lead">{lead}</p> : null}
        {children}
      </div>
    </main>
  );
}
