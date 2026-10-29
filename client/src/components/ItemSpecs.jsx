import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { buildSpecGroups } from "../lib/itemView.js";
import { t } from "../i18n/index.js";
import styles from "./ItemSpecs.module.css";

// The nearest ancestor that scrolls (the sheet's body, or null when the whole page scrolls).
function scrollParent(node) {
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

// A panel opened far down the page would land off screen or behind the sticky bar. Bring it into view:
// the whole panel when it fits, otherwise its heading and the start of its text. Does nothing if it is already in view.
function bringIntoView(node, force) {
  if (!node?.scrollIntoView) return;
  const parent = scrollParent(node);
  const room = parent ? parent.clientHeight : window.visualViewport?.height ?? window.innerHeight;
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ block: force ?? (node.offsetHeight <= room * 0.9 ? "nearest" : "start"), inline: "nearest", behavior: calm ? "auto" : "smooth" });
}

const GROUP_PANELS = {
  "Features & Specs": { key: "specs_features", title: "item.group.features" },
  Measurements: { key: "specs_measurements", title: "item.group.measurements" },
  "Additional details": { key: "specs_additional", title: "item.group.additional" },
  "User guide": { key: "specs_guide", title: "item.group.guide" },
  "Item details": { key: "specs_details", title: "item.group.details" }
};

function Panel({ id, title, open, onToggle, panelRef, children }) {
  return (
    <div className={styles.panel} ref={panelRef}>
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

export default function ItemSpecs({ item, category, attributes, onExpand, reveal = 0 }) {
  const uid = useId();
  const groups = buildSpecGroups({ item, category, attributes });
  const firstKey = groups.length ? GROUP_PANELS[groups[0].name].key : null;
  const [open, setOpen] = useState(firstKey ? { [firstKey]: true } : {});
  const includes = item.includes ?? [];
  const nodes = useRef({});
  const pending = useRef({ key: null, force: undefined });
  const toggle = (key) => () => {
    if (!open[key]) {
      onExpand?.(key);
      pending.current = { key, force: undefined };
    }
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const { key, force } = pending.current;
    if (!key) return;
    pending.current = { key: null, force: undefined };
    bringIntoView(nodes.current[key], force);
  }, [open]);

  const seen = useRef(reveal);
  useEffect(() => {
    if (reveal === seen.current) return;
    seen.current = reveal;
    if (!firstKey) return;
    if (!open[firstKey]) onExpand?.(firstKey);
    pending.current = { key: firstKey, force: "start" };
    setOpen((prev) => ({ ...prev, [firstKey]: true }));
  }, [reveal]);

  const panels = [
    ...groups.map((group) => {
      const { key, title } = GROUP_PANELS[group.name];
      return {
        key,
        title: t(title),
        body: (
          <dl className={styles.table}>
            {group.rows.map((row) => (
              <div key={row.label} className={styles.row}>
                <dt className={styles.label}>{row.label}</dt>
                <dd className={styles.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )
      };
    }),
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
        <Panel
          key={panel.key}
          id={`${uid}-${panel.key}`}
          title={panel.title}
          open={Boolean(open[panel.key])}
          onToggle={toggle(panel.key)}
          panelRef={(node) => { nodes.current[panel.key] = node; }}
        >
          {panel.body}
        </Panel>
      ))}
    </section>
  );
}
