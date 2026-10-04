import { useEffect, useState } from "react";

export function useInView(targetRef, rootRef, key) {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      root: rootRef?.current ?? null,
      threshold: 0
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef, rootRef, key]);

  return inView;
}
