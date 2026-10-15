import { useId, useRef, useState } from "react";
import { cx } from "./cx.js";
import styles from "./Tabs.module.css";

/**
 * items: [{ id, label, count?, disabled?, content }]
 * Keyboard (WAI-ARIA tabs): Left/Right move between tabs, Home/End jump to the ends, and only the
 * selected tab is in the Tab order. `activation="auto"` selects as focus moves; "manual" needs
 * Enter or Space. Use `value` + `onChange` to control it, or `defaultValue` to leave it uncontrolled.
 * Only the selected panel is rendered, so heavy panels cost nothing until opened.
 */
export function Tabs({ items, value, defaultValue, onChange, label, activation = "auto", className }) {
  const base = useId();
  const [inner, setInner] = useState(defaultValue ?? items.find((i) => !i.disabled)?.id);
  const selected = value ?? inner;
  const refs = useRef({});

  const enabled = items.filter((i) => !i.disabled);
  const select = (id) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const focusTab = (id, activate) => {
    refs.current[id]?.focus();
    if (activate) select(id);
  };

  const onKeyDown = (event, id) => {
    const at = enabled.findIndex((i) => i.id === id);
    let target = null;
    if (event.key === "ArrowRight") target = enabled[(at + 1) % enabled.length];
    else if (event.key === "ArrowLeft") target = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    else if (activation === "manual" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      select(id);
      return;
    }
    if (!target) return;
    event.preventDefault();
    focusTab(target.id, activation === "auto");
  };

  const current = items.find((i) => i.id === selected) ?? enabled[0];

  return (
    <div className={cx(styles.root, className)}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((item) => {
          const isSelected = item.id === current?.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              className={cx(styles.tab, isSelected && styles.selected)}
              onClick={() => select(item.id)}
              onKeyDown={(e) => onKeyDown(e, item.id)}
            >
              <span>{item.label}</span>
              {item.count != null ? <span className={styles.count}>{item.count}</span> : null}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          tabIndex={0}
          className={styles.panel}
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}
