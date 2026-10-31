import ErrorCard from "./ErrorCard.jsx";

/** The standard "could not load" block used across the admin. Same props as before, now backed by ErrorCard. */
export default function LoadError({ what, error, onRetry }) {
  return <ErrorCard what={what} error={error} onRetry={onRetry} />;
}
