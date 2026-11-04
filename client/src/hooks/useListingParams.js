import { useSearchParams } from "react-router-dom";

/** The URL's search params plus a `set(patch)` that writes the filled values and drops the empty ones. */
export function useListingParams() {
  const [params, setParams] = useSearchParams();
  const set = (patch) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        return next;
      },
      { replace: true }
    );
  return [params, set];
}
