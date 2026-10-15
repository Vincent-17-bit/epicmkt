import { NavLink } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { badgeFor, hrefOf } from "../routes/config.js";

export const formatBadge = (n) => (n > 99 ? "99+" : String(n));

/**
 * The navigation links, shared by the sidebar and the phone drawer.
 * Badges come from admin_counts(). Collapsed, a badge sits on the icon and the label stays for screen readers.
 */
export default function NavList({ routes, counts, collapsed = false, onNavigate }) {
  return (
    <ul className="nav-list">
      {routes.map((route) => {
        const count = badgeFor(route, counts);
        return (
          <li key={route.id}>
            <NavLink
              to={hrefOf(route)}
              end={route.path === ""}
              onClick={onNavigate}
              title={collapsed ? route.title : undefined}
              className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
            >
              <span className="nav-item__icon"><Icon name={route.icon} />
                {collapsed && count > 0 ? <span className={`nav-badge nav-badge--dot ${route.badgeTone === "danger" ? "is-danger" : ""}`} aria-hidden="true" /> : null}
              </span>
              <span className={collapsed ? "sr-only" : "nav-item__label"}>{route.title}</span>
              {count > 0 ? (
                <span className={`nav-badge ${route.badgeTone === "danger" ? "is-danger" : ""} ${collapsed ? "sr-only" : ""}`}>
                  <span aria-hidden="true">{formatBadge(count)}</span>
                  <span className="sr-only">, {count} need attention</span>
                </span>
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
