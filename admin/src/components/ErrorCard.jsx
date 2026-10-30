import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import Button from "./Button.jsx";
import { describeLoadError } from "../lib/errorCopy.js";

/** A failed load: what went wrong, how to fix it, and a Try again button. */
export default function ErrorCard({ what, error, onRetry, retrying = false }) {
  const { problem, fix, detail } = describeLoadError(error);
  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
      <p className="state-card__title">We could not load {what}</p>
      <p className="state-card__text">{problem} {fix}</p>
      {detail ? <p className="state-card__detail">{detail}</p> : null}
      {onRetry ? <Button onClick={onRetry} disabled={retrying}>{retrying ? "Trying again…" : "Try again"}</Button> : null}
    </div>
  );
}
