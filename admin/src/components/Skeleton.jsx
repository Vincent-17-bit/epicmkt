// Placeholder shapes shown while data loads. Purely visual: the wrapper announces "Loading" once.
export default function Skeleton({ variant = "line", className = "" }) {
  return <span className={`skeleton skeleton--${variant} ${className}`.trim()} aria-hidden="true" />;
}

/** A few text-like lines. The last one is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, label = "Loading" }) {
  return (
    <div className="skeleton-group" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={index === lines - 1 && lines > 1 ? "skeleton--short" : ""} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder: a small label, a big number, a footer line. */
export function SkeletonCard({ label = "Loading" }) {
  return (
    <div className="skeleton-card" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="skeleton--short" />
      <Skeleton variant="value" />
      <Skeleton className="skeleton--short" />
    </div>
  );
}
