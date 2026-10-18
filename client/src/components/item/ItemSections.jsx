import { useEffect, useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faFlag } from "@fortawesome/free-solid-svg-icons";
import { paragraphs, previewText } from "../../lib/itemView.js";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

export function Section({ id, title, mobile, defaultOpen = false, flush = false, children }) {
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);
  const headId = `${uid}-h`;
  const bodyId = `${uid}-b`;

  if (!mobile) {
    return (
      <section id={id} className={`${styles.card} ${styles.section}`} aria-labelledby={headId}>
        <h2 id={headId} className={styles.h2}>
          {title}
        </h2>
        <div className={flush ? styles.flush : undefined}>{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className={`${styles.card} ${styles.section}`}>
      <h2 className={styles.h2Mobile}>
        <button type="button" id={headId} className={styles.accordion} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <span>{title}</span>
          <FontAwesomeIcon icon={faChevronDown} className={`${styles.chevron} ${open ? styles.turned : ""}`} aria-hidden="true" />
        </button>
      </h2>
      <div id={bodyId} role="region" aria-labelledby={headId} hidden={!open} className={flush ? styles.flush : styles.accordionBody}>
        {children}
      </div>
    </section>
  );
}

function Paragraphs({ list }) {
  return list.map((text, index) => (
    <p key={index} className={styles.text}>
      {text}
    </p>
  ));
}

export function Overview({ description, facts }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [description]);
  const preview = previewText(description);
  const list = paragraphs(expanded || !preview.truncated ? description : preview.text);

  return (
    <>
      <Paragraphs list={list} />
      {preview.truncated && (
        <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("item.readLess") : t("item.readMore")}
        </button>
      )}
      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

export function DetailsTable({ groups }) {
  return groups.map((group) => (
    <div key={group.name ?? "_"} className={styles.group}>
      {group.name && <h3 className={styles.h3}>{group.name}</h3>}
      <dl className={styles.table}>
        {group.rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  ));
}

export function About({ headline, fullDescription, includes }) {
  return (
    <>
      {headline && (
        <p className={styles.headline}>
          <span className={styles.headlineLabel}>{t("item.fromSeller")}</span>
          {headline}
        </p>
      )}
      <Paragraphs list={paragraphs(fullDescription)} />
      {includes.length > 0 && (
        <>
          <h3 className={styles.h3}>{t("item.included")}</h3>
          <ul className={styles.checks}>
            {includes.map((entry) => (
              <li key={entry} className={styles.check}>
                <FontAwesomeIcon icon={faCheck} className={styles.tick} aria-hidden="true" />
                <span>{entry}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function Additional({ rows, onReport }) {
  return (
    <>
      <dl className={styles.table}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>{t("item.disclaimer")}</p>
      <button type="button" className={styles.linkBtn} onClick={onReport}>
        <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
        {t("item.reportPrice")}
      </button>
    </>
  );
}
