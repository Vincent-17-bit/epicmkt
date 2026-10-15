import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useDismiss } from "../hooks/useDismiss.js";
import { badgeFor, hrefOf } from "../routes/config.js";
import { formatBadge } from "./NavList.jsx";

/** Everything that currently needs attention and that this role can open, from the same counts as the sidebar. */
export default function BellMenu({ routes, counts }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, box, button);

  const items = routes.map((route) => ({ route, count: badgeFor(route, counts) })).filter((item) => item.count > 0);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="popover-host" ref={box}>
      <button ref={button} type="button" className="icon-button" aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen((v) => !v)}
        aria-label={total ? `Notifications, ${total} need attention` : "Notifications, nothing needs attention"}>
        <Icon name="bell" />
        {total > 0 ? <span className="nav-badge nav-badge--corner" aria-hidden="true">{formatBadge(total)}</span> : null}
      </button>
      {open ? (
        <div className="popover popover--bell" id="bell-panel">
          <p className="popover__title">Needs attention</p>
          {items.length === 0 ? <p className="popover__empty">Nothing is waiting for you.</p> : (
            <ul>
              {items.map(({ route, count }) => (
                <li key={route.id}><Link to={hrefOf(route)} onClick={close}><span>{route.title}</span><span className="nav-badge">{formatBadge(count)}</span></Link></li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
