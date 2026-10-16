import { useRef } from "react";

export default function Tabs({ tabs, value, onChange, counts, label, idPrefix }) {
  const refs = useRef({});

  const onKeyDown = (event, index) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    event.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {counts ? <span className="tabs__count">{counts[tab.id] ?? "–"}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
