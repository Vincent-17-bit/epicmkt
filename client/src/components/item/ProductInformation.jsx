import { useEffect, useId, useRef, useState } from "react";
import { buildFaqs, buildInfoGroups } from "@epicmkt/shared";
import { SectionHead } from "./ItemSections.jsx";
import frame from "./ItemSections.module.css";
import styles from "./ProductInformation.module.css";

export const OPEN_PRODUCT_INFO = "epicmkt:open-product-info";
export const PRODUCT_INFO_ID = "item-product-info";

export const openProductInfo = () => window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_INFO));

const calm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The first groups start open so the facts are seen without a tap, like Amazon's product information tables; the rest are a tap away.
const OPEN_AT_START = 2;
// Questions shown before "See all"; each one is shown whole (question and answer), as Amazon lists them.
const FAQ_SHOWN = 4;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Chevron({ open }) {
  return (
    <svg className={`${styles.chevron} ${open ? styles.turned : ""}`} viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
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

export function ProductInfoLink() {
  return (
    <button type="button" className={styles.jump} onClick={openProductInfo}>
      See more product details
    </button>
  );
}

const startOpen = (groups) => Object.fromEntries(groups.slice(0, OPEN_AT_START).map((g) => [g.name, true]));

// "Product information": the seller's facts in groups, each a two-column table (name, value) that folds, two columns of groups on big
// screens. Then the seller's questions and answers, listed whole. The links "See more product details" open every group and come here.
export default function ProductInformation({ item }) {
  const uid = useId();
  const groups = buildInfoGroups(item?.specs);
  const faqs = buildFaqs(item?.specs);
  const [open, setOpen] = useState(() => startOpen(groups));
  const [allFaqs, setAllFaqs] = useState(false);
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
  const shownFaqs = allFaqs ? faqs : faqs.slice(0, FAQ_SHOWN);
  const titleId = `${uid}-title`;
  const faqId = `${uid}-faq`;

  return (
    <section id={PRODUCT_INFO_ID} ref={root} tabIndex={-1} className={`${frame.section} ${styles.section}`} aria-labelledby={groups.length ? titleId : faqId}>
      {groups.length > 0 && (
        <div className={styles.block}>
          <SectionHead id={titleId} title="Product information" note={`${plural(facts, "detail")} in ${plural(groups.length, "group")}`}>
            {groups.length > 1 && (
              <button type="button" className={styles.all} onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.name, !all])))}>
                {all ? "Collapse all" : "Expand all"}
              </button>
            )}
          </SectionHead>
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
                    <table className={styles.table}>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.label}>
                            <th scope="row">{row.label}</th>
                            <td>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Fold>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {faqs.length > 0 && (
        <div className={styles.block} data-after={groups.length ? "" : undefined}>
          <SectionHead id={faqId} title="Questions and answers" note={`From the seller · ${plural(faqs.length, "answer")}`} />
          <dl className={styles.faqs} aria-labelledby={faqId}>
            {shownFaqs.map((faq, i) => (
              <div key={`${i}-${faq.question}`} className={styles.faq}>
                <dt className={styles.question}><span className={styles.qa} aria-hidden="true">Q:</span><span>{faq.question}</span></dt>
                <dd className={styles.answer}><span className={styles.qa} aria-hidden="true">A:</span><span>{faq.answer}</span></dd>
              </div>
            ))}
          </dl>
          {faqs.length > FAQ_SHOWN && (
            <button type="button" className={styles.more} aria-expanded={allFaqs} onClick={() => setAllFaqs((v) => !v)}>
              {allFaqs ? "Show fewer questions" : `See all ${faqs.length} questions`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
