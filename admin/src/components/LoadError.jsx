import Button from "./Button.jsx";
import { describeError } from "../lib/systemStatus.js";

/** The standard "could not load" block: what failed, the likely cause, and a way to retry. */
export default function LoadError({ what, error, onRetry }) {
  const { title, cause } = describeError(error);
  return (
    <div role="alert" className="load-error">
      <p>We could not load {what}. {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}</p>
      <p><strong>{title}.</strong> {cause}</p>
    </div>
  );
}
