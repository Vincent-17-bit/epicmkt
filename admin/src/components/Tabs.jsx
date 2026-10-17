import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const FADE = "1.5rem";

export default function Tabs({ tabs, value, onChange, counts, label, idPrefix }) {
  const refs = useRef({});
  const listRef = useRef(null);

  // Fade only the edge that has more tabs behind it.
  const updateFade = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    list.style.setProperty("--tabs-fade-start", list.scrollLeft > 1 ? FADE : "0px");
    list.style.setProperty("--tabs-fade-end", list.scrollLeft < max - 1 ? FADE : "0px");
  }, []);

  useLayoutEffect(() => {
    updateFade();
    const list = listRef.current;
    const observer = new ResizeObserver(updateFade);
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateFade, tabs, counts]);

  // Bring the selected tab into view by moving only the strip itself.
  // (scrollIntoView would also reset the browser's keyboard-navigation start.)
  useEffect(() => {
    const list = listRef.current;
    const tab = refs.current[value];
    if (!list || !tab) return;
    const pad = 32;
    const left = tab.offsetLeft - pad;
    const right = tab.offsetLeft + tab.offsetWidth + pad;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduce ? "auto" : "smooth";
    if (left < list.scrollLeft) list.scrollTo({ left: Math.max(left, 0), behavior });
    else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth, behavior });
  }, [value]);

  const onKeyDown = (event, index) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    event.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onScroll={updateFade}>
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
