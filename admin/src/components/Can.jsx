import { useId } from "react";
import { usePermissions } from "../hooks/usePermissions.js";

/**
 * Shows children only when the role may do `action`. Use it for things a role should not even see.
 * Pass `fallback` to show something else (for example an explanation) instead of nothing.
 */
export function Can({ action, children, fallback = null }) {
  const { can } = usePermissions();
  return can(action) ? children : fallback;
}

/**
 * A button that is blocked, and says why, when the role may not do `action`.
 *
 * It uses aria-disabled rather than disabled, so keyboard and screen reader users can still reach it and hear the
 * reason. A blocked press does nothing. The reason is also a tooltip on hover and focus.
 */
export function ActionButton({ action, onClick, className = "", children, ...rest }) {
  const { check } = usePermissions();
  const reasonId = useId();
  const { allowed, reason } = check(action);
  return (
    <span className={`blocked-wrap ${allowed ? "" : "is-blocked"}`}>
      <button
        type="button"
        {...rest}
        className={className}
        aria-disabled={allowed ? undefined : "true"}
        aria-describedby={allowed ? rest["aria-describedby"] : reasonId}
        onClick={allowed ? onClick : (event) => event.preventDefault()}
      >
        {children}
      </button>
      {allowed ? null : <span id={reasonId} role="tooltip" className="blocked-reason">{reason}</span>}
    </span>
  );
}
