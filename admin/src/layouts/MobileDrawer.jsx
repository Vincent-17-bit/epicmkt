import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import NavList from "./NavList.jsx";

/** Phone menu: slides in from the left over a scrim. Escape, the scrim and the close button all close it. */
export default function MobileDrawer({ open, onClose, routes, counts, admin, onSignOut }) {
  const panel = useRef(null);
  const closeButton = useRef(null);
  const { roleLabel, can } = usePermissions();
  useFocusTrap(open, panel, closeButton);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer">
      <div className="drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer__panel" ref={panel} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer__head">
          <span className="sidebar__logo" aria-hidden="true">E</span>
          <span className="sidebar__brand-copy"><strong>EpicMKT</strong><small>Admin</small></span>
          <button ref={closeButton} type="button" className="icon-button drawer__close" onClick={onClose} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        <nav className="drawer__nav" aria-label="Admin">
          <NavList routes={routes} counts={counts} onNavigate={onClose} />
        </nav>
        <div className="drawer__foot">
          <p className="drawer__who"><strong>{admin.name || admin.email}</strong><span>{roleLabel}</span></p>
          {can("security.view") ? <Link className="drawer__link" to="/admin/security" onClick={onClose}><Icon name="shield" /> Security and sessions</Link> : null}
          <button type="button" className="drawer__link" onClick={onSignOut}><Icon name="signOut" /> Sign out</button>
        </div>
      </div>
    </div>
  );
}
