import { NavLink } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { badgeFor, hrefOf } from "../routes/config.js";
import { formatBadge } from "./NavList.jsx";

/** Phone bottom bar: the first four pages this role can open, then More (opens the drawer). */
export default function BottomBar({ routes, counts, onMore, moreRef }) {
  return (
    <nav className="bottom-bar" aria-label="Main">
      {routes.map((route) => {
        const count = badgeFor(route, counts);
        return (
          <NavLink key={route.id} to={hrefOf(route)} end={route.path === ""} className={({ isActive }) => `bottom-bar__item ${isActive ? "is-active" : ""}`}>
            <span className="bottom-bar__icon"><Icon name={route.icon} />
              {count > 0 ? <span className="nav-badge nav-badge--corner" aria-hidden="true">{formatBadge(count)}</span> : null}
            </span>
            <span className="bottom-bar__label">{route.title}</span>
            {count > 0 ? <span className="sr-only">, {count} need attention</span> : null}
          </NavLink>
        );
      })}
      <button type="button" ref={moreRef} className="bottom-bar__item" onClick={onMore}>
        <span className="bottom-bar__icon"><Icon name="more" /></span>
        <span className="bottom-bar__label">More</span>
      </button>
    </nav>
  );
}
