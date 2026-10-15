import Icon from "../components/Icon.jsx";
import NavList from "./NavList.jsx";

/** Desktop and tablet sidebar: 272px open, 80px collapsed. "[" toggles it (wired in AdminLayout). */
export default function Sidebar({ routes, counts, collapsed, onToggle }) {
  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">E</span>
        <span className={collapsed ? "sr-only" : "sidebar__brand-copy"}><strong>EpicMKT</strong><small>Admin</small></span>
      </div>
      <nav className="sidebar__nav" aria-label="Admin">
        <NavList routes={routes} counts={counts} collapsed={collapsed} />
      </nav>
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-keyshortcuts="["
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
        >
          <Icon name="chevron" className="sidebar__chevron" />
          {collapsed ? null : <><span>Collapse</span><kbd aria-hidden="true">[</kbd></>}
        </button>
      </div>
    </aside>
  );
}
