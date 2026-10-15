import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useDismiss } from "../hooks/useDismiss.js";
import { usePermissions } from "../hooks/usePermissions.js";

const initials = (admin) => {
  const source = (admin.name || admin.email || "?").replace(/\(.*\)/, "").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
};

/** Avatar button and its panel: who you are, your role, the theme switch, security, sign out. */
export default function AvatarMenu({ admin, theme, onToggleTheme, onSignOut }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const { roleLabel, can } = usePermissions();
  useDismiss(open, close, box, button);

  return (
    <div className="popover-host" ref={box}>
      <button ref={button} type="button" className="avatar" aria-expanded={open} aria-controls="account-panel" aria-label={`Account menu, ${admin.name || admin.email}`} onClick={() => setOpen((v) => !v)}>
        {initials(admin)}
      </button>
      {open ? (
        <div className="popover popover--account" id="account-panel">
          <p className="popover__who"><strong>{admin.name || "Admin"}</strong><span>{admin.email}</span><span className="role-pill">{roleLabel}</span></p>
          <button type="button" className="popover__row" role="switch" aria-checked={theme === "dark"} onClick={onToggleTheme}>
            <span>Dark theme</span><span className="switch" aria-hidden="true" />
          </button>
          {can("security.view") ? <Link className="popover__row" to="/admin/security" onClick={close}><span><Icon name="shield" /> Security and sessions</span></Link> : null}
          <button type="button" className="popover__row popover__row--danger" onClick={onSignOut}><span><Icon name="signOut" /> Sign out</span></button>
        </div>
      ) : null}
    </div>
  );
}
