import { useId, useRef } from "react";
import styles from "./DetailsTabs.module.css";

export default function DetailsTabs({ tabs, active, onChange, label }) {
  const uid = useId();
  const refs = useRef({});
  const ids = (id) => ({ tab: `${uid}-${id}-tab`, panel: `${uid}-${id}-panel` });
  const move = (to) => {
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };
  const onKey = (e, index) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    move(next);
  };
  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={ids(tab.id).tab}
            ref={(node) => { refs.current[tab.id] = node; }}
            aria-selected={active === tab.id}
            aria-controls={ids(tab.id).panel}
            tabIndex={active === tab.id ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={ids(tab.id).panel} aria-labelledby={ids(tab.id).tab} hidden={active !== tab.id} tabIndex={0} className={styles.panel}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
