import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "./Button.jsx";

/**
 * Nothing to show yet. An icon, a title, one line of explanation and at most one action.
 * `action` is { label, to } for a link or { label, onClick } for a button.
 */
export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="state-card state-card--empty">
      {icon ? <span className="state-card__icon" aria-hidden="true"><FontAwesomeIcon icon={icon} /></span> : null}
      <p className="state-card__title">{title}</p>
      {children ? <p className="state-card__text">{children}</p> : null}
      {action?.to ? <Link to={action.to} className="secondary-button admin-button">{action.label}</Link> : null}
      {action?.onClick ? <Button onClick={action.onClick}>{action.label}</Button> : null}
    </div>
  );
}
