import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { buildSpecGroups, countRows, limitGroups, SPEC_LIMIT } from "../lib/itemView.js";
import { t } from "../i18n/index.js";
import styles from "./ItemSpecs.module.css";

function Panel({ id, title, open, onToggle, children }) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          id={`${id}-head`}
          onClick={onToggle}
        >
          <span>{title}</span>
          <FontAwesomeIcon icon={faChevronDown} className={`${styles.chevron} ${open ? styles.turned : ""}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={`${id}-body`} role="region" aria-labelledby={`${id}-head`} hidden={!open} className={styles.content}>
        {children}
      </div>
    </div>
  );
}

export default function ItemSpecs({ item, category, attributes, onExpand }) {
  const uid = useId();
  const [open, setOpen] = useState({ specs: true });
  const [all, setAll] = useState(false);

  const groups = buildSpecGroups({ item, category, attributes });
  const total = countRows(groups);
  const shown = all ? groups : limitGroups(groups, SPEC_LIMIT);
  const includes = item.includes ?? [];
  const toggle = (key) => () => {
    if (!open[key]) onExpand?.(key);
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleAll = () => {
    if (!all) onExpand?.("specs_all");
    setAll((v) => !v);
  };

  const panels = [
    total > 0 && {
      key: "specs",
      title: t("item.specs"),
      body: (
        <>
          {shown.map((group) => (
            <div key={group.name ?? "_"} className={styles.group}>
              {group.name && <h4 className={styles.groupName}>{group.name}</h4>}
              <dl className={styles.table}>
                {group.rows.map((row) => (
                  <div key={row.label} className={styles.row}>
                    <dt className={styles.label}>{row.label}</dt>
                    <dd className={styles.value}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {total > SPEC_LIMIT && (
            <button type="button" className={styles.more} aria-expanded={all} onClick={toggleAll}>
              {all ? t("item.showLess") : t("item.showAll")}
            </button>
          )}
        </>
      )
    },
    item.description && { key: "description", title: t("item.description"), body: <p className={styles.text}>{item.description}</p> },
    includes.length > 0 && {
      key: "included",
      title: t("item.included"),
      body: (
        <ul className={styles.checks}>
          {includes.map((entry) => (
            <li key={entry} className={styles.check}>
              <FontAwesomeIcon icon={faCheck} className={styles.tick} aria-hidden="true" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      )
    },
    item.terms && { key: "terms", title: t("item.terms"), body: <p className={styles.text}>{item.terms}</p> }
  ].filter(Boolean);

  if (!panels.length) return null;

  return (
    <section className={styles.section} aria-label={t("item.specs")}>
      {panels.map((panel) => (
        <Panel key={panel.key} id={`${uid}-${panel.key}`} title={panel.title} open={Boolean(open[panel.key])} onToggle={toggle(panel.key)}>
          {panel.body}
        </Panel>
      ))}
    </section>
  );
}
