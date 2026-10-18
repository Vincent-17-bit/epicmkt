import { useEffect, useState } from "react";

export function useNearViewport(ref, margin = "400px") {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (near) return undefined;
    const target = ref.current;
    if (!target) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [near, ref, margin]);

  return near;
}
