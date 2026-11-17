import { useEffect, useId, useRef, useState } from "react";
import { buildFaqs, buildInfoGroups } from "@epicmkt/shared";
import styles from "./ProductInformation.module.css";

export const OPEN_PRODUCT_INFO = "epicmkt:open-product-info";
export const PRODUCT_INFO_ID = "item-product-info";

export const openProductInfo = () => window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_INFO));

const calm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Chevron({ open }) {
  return (
    <svg className={`${styles.chevron} ${open ? styles.turned : ""}`} viewBox="0 0 12 8" width="14" height="10" aria-hidden="true">
      <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Fold({ id, open, children }) {
  return (
    <div className={styles.fold} data-open={open ? "" : undefined}>
      <div id={`${id}-body`} role="region" aria-labelledby={`${id}-head`} className={styles.foldInner} inert={open ? undefined : ""}>
        {children}
      </div>
    </div>
  );
}

export default function ProductInformation({ item }) {
  const uid = useId();
  const groups = buildInfoGroups(item?.specs);
  const faqs = buildFaqs(item?.specs);
  const [open, setOpen] = useState({});
  const [asked, setAsked] = useState({});
  const root = useRef(null);
  const count = groups.length;

  useEffect(() => {
    const show = () => {
      setOpen(Object.fromEntries(groups.map((g) => [g.name, true])));
      root.current?.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
      root.current?.focus({ preventScroll: true });
    };
    window.addEventListener(OPEN_PRODUCT_INFO, show);
    return () => window.removeEventListener(OPEN_PRODUCT_INFO, show);
  }, [count]);

  if (!groups.length && !faqs.length) return null;

  const all = groups.every((g) => open[g.name]);
  const facts = groups.reduce((n, g) => n + g.rows.length, 0);
  const toggle = (name) => setOpen((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <section id={PRODUCT_INFO_ID} ref={root} tabIndex={-1} className={styles.section} aria-labelledby={`${uid}-title`}>
      {groups.length > 0 && (
        <div className={styles.block}>
          <header className={styles.head}>
            <div>
              <h2 id={`${uid}-title`} className={styles.title}>Product information</h2>
              <p className={styles.sub}>{facts} {facts === 1 ? "fact" : "facts"} in {groups.length} {groups.length === 1 ? "group" : "groups"}</p>
            </div>
            <button type="button" className={styles.all} onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.name, !all])))}>
              {all ? "Collapse all" : "Expand all"}
            </button>
          </header>
          <div className={styles.groups}>
            {groups.map((group, i) => {
              const id = `${uid}-g${i}`;
              const isOpen = Boolean(open[group.name]);
              return (
                <article key={group.name} className={styles.group} data-open={isOpen ? "" : undefined}>
                  <h3 className={styles.heading}>
                    <button type="button" className={styles.trigger} id={`${id}-head`} aria-expanded={isOpen} aria-controls={`${id}-body`} onClick={() => toggle(group.name)}>
                      <span className={styles.name}>{group.name}</span>
                      <span className={styles.tally}>{group.rows.length}</span>
                      <Chevron open={isOpen} />
                    </button>
                  </h3>
                  <Fold id={id} open={isOpen}>
                    <dl className={styles.table}>
                      {group.rows.map((row) => (
                        <div key={row.label} className={styles.row}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Fold>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {faqs.length > 0 && (
        <div className={styles.block}>
          <header className={styles.head}>
            <div>
              <h2 id={`${uid}-faq`} className={styles.title}>Questions and answers</h2>
              <p className={styles.sub}>From the seller · {faqs.length} {faqs.length === 1 ? "answer" : "answers"}</p>
            </div>
          </header>
          <ul className={styles.faqs} aria-labelledby={`${uid}-faq`}>
            {faqs.map((faq, i) => {
              const id = `${uid}-q${i}`;
              const isOpen = Boolean(asked[i]);
              return (
                <li key={`${i}-${faq.question}`} className={styles.faq} data-open={isOpen ? "" : undefined}>
                  <h3 className={styles.heading}>
                    <button type="button" className={styles.ask} id={`${id}-head`} aria-expanded={isOpen} aria-controls={`${id}-body`} onClick={() => setAsked((prev) => ({ ...prev, [i]: !prev[i] }))}>
                      <span className={styles.badge} aria-hidden="true">Q</span>
                      <span className={styles.question}>{faq.question}</span>
                      <Chevron open={isOpen} />
                    </button>
                  </h3>
                  <Fold id={id} open={isOpen}>
                    <p className={styles.answer}><span className={`${styles.badge} ${styles.badgeA}`} aria-hidden="true">A</span><span>{faq.answer}</span></p>
                  </Fold>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
