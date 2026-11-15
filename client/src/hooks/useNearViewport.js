import { useEffect, useState } from "react";

// Start fetching about a screen before the section is reached, so it is usually ready by the time it is scrolled to, and
// never competes with the item's own data or the first paint.
const ROOT_MARGIN = "600px 0px";

// True once `ref` has come within ROOT_MARGIN of the viewport, and stays true. Without IntersectionObserver (very old browsers)
// it is true at once, so the row is never lost.
export function useNearViewport(ref) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (near || !node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}
