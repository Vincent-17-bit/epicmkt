import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import AvatarMenu from "./AvatarMenu.jsx";
import BellMenu from "./BellMenu.jsx";
import EatClock from "./EatClock.jsx";

function crumbsFor(route) {
  const trail = [{ label: "Admin", to: "/admin" }];
  if (route && route.id !== "command") trail.push({ label: route.section });
  trail.push({ label: route?.title ?? "Not found" });
  return trail;
}

/** Sticky header: menu button (phones), breadcrumb and title, search, EAT clock, bell, avatar menu. */
export default function Header({ route, routes, counts, admin, theme, onToggleTheme, onOpenMenu, menuRef, onSignOut, titleRef }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef(null);
  const crumbs = crumbsFor(route);

  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);

  return (
    <header className={`header ${searchOpen ? "is-searching" : ""}`}>
      <button ref={menuRef} type="button" className="icon-button header__menu" onClick={onOpenMenu} aria-label="Open menu"><Icon name="menu" /></button>

      <div className="header__title">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={crumb.label} className={last ? "is-current" : ""}>
                  {crumb.to && !last ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={last ? "page" : undefined}>{crumb.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
        <h1 ref={titleRef} tabIndex={-1}>{route?.title ?? "Page not found"}</h1>
      </div>

      <div className="header__tools">
        <button type="button" className="icon-button header__search-toggle" aria-expanded={searchOpen} aria-controls="admin-search" aria-label={searchOpen ? "Close search" : "Open search"} onClick={() => setSearchOpen((v) => !v)}>
          <Icon name={searchOpen ? "close" : "search"} />
        </button>
        <EatClock />
        <BellMenu routes={routes} counts={counts} />
        <AvatarMenu admin={admin} theme={theme} onToggleTheme={onToggleTheme} onSignOut={onSignOut} />
      </div>

      <form className="search" id="admin-search" role="search" onSubmit={(e) => e.preventDefault()} onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}>
        <label className="search__field">
          <span className="sr-only">Search the admin</span>
          <Icon name="search" />
          <input ref={searchInput} type="search" placeholder="Search (coming soon)" readOnly title="Search is added in a later step" />
        </label>
      </form>
    </header>
  );
}
