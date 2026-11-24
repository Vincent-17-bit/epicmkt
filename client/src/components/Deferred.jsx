import { Suspense, useEffect, useRef, useState } from "react";

export default function Deferred({ children, height, margin = "250px", settle = 250 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown) return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry.isIntersecting) timer = setTimeout(() => setShown(true), settle);
    }, { rootMargin: `0px 0px ${margin} 0px` });
    observer.observe(ref.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [shown, margin, settle]);
  const space = <div ref={shown ? undefined : ref} style={{ minBlockSize: height }} aria-hidden="true" />;
  return shown ? <Suspense fallback={space}>{children}</Suspense> : space;
}
