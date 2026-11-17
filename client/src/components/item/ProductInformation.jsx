import { useEffect, useId, useRef, useState } from "react";
import { buildInfoGroups } from "@epicmkt/shared";
import styles from "./ProductInformation.module.css";

export const OPEN_PRODUCT_INFO = "epicmkt:open-product-info";
export const PRODUCT_INFO_ID = "item-product-info";

export const openProductInfo = () => window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_INFO));

const calm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ProductInformation({ item }) {
  const uid = useId();
  const groups = buildInfoGroups(item?.specs);
  const [open, setOpen] = useState({});
  const root = useRef(null);

  useEffect(() => {
    const show = () => {
      setOpen(Object.fromEntries(groups.map((g) => [g.name, true])));
      root.current?.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
      root.current?.focus({ preventScroll: true });
    };
    window.addEventListener(OPEN_PRODUCT_INFO, show);
    return () => window.removeEventListener(OPEN_PRODUCT_INFO, show);
  }, [groups.length]);

  if (!groups.length) return null;

  const all = groups.every((g) => open[g.name]);
  const toggle = (name) => setOpen((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <section id={PRODUCT_INFO_ID} ref={root} tabIndex={-1} className={styles.section} aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <h2 id={`${uid}-title`} className={styles.title}>Product information</h2>
        <button type="button" className={styles.all} onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.name, !all])))}>
          {all ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className={styles.cols}>
        {groups.map((group, i) => {
          const id = `${uid}-${i}`;
          const isOpen = Boolean(open[group.name]);
          return (
            <div key={group.name} className={styles.group}>
              <h3 className={styles.heading}>
                <button type="button" className={styles.trigger} id={`${id}-head`} aria-expanded={isOpen} aria-controls={`${id}-body`} onClick={() => toggle(group.name)}>
                  <span>{group.name}</span>
                  <svg className={`${styles.chevron} ${isOpen ? styles.turned : ""}`} viewBox="0 0 12 8" width="14" height="10" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </h3>
              <div id={`${id}-body`} role="region" aria-labelledby={`${id}-head`} hidden={!isOpen}>
                <dl className={styles.table}>
                  {group.rows.map((row) => (
                    <div key={row.label} className={styles.row}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
