import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import styles from "./shell.module.css";

const positions = new Map();

export default function ScrollArea({ children }) {
  const ref = useRef(null);
  const { key } = useLocation();
  const type = useNavigationType();
  const current = useRef(key);

  useLayoutEffect(() => {
    current.current = key;
    const el = ref.current;
    const target = type === "POP" ? positions.get(key) ?? 0 : 0;
    el.scrollTop = target;
    if (!target) return undefined;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = target;
    });
    return () => cancelAnimationFrame(frame);
  }, [key, type]);

  return (
    <main ref={ref} className={styles.content} id="content" tabIndex={-1} data-testid="content" onScroll={(e) => positions.set(current.current, e.currentTarget.scrollTop)}>
      {children}
    </main>
  );
}
