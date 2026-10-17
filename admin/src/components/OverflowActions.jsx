import { useLayoutEffect, useRef, useState } from "react";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import Button from "./Button.jsx";
import Popover from "./DataTable/Popover.jsx";

const GAP = 8;

/**
 * A row of action buttons that moves whatever does not fit into a "More"
 * menu. A hidden copy of the row is measured, so nothing flashes or wraps.
 */
export default function OverflowActions({ items, onSelect }) {
  const wrapRef = useRef(null);
  const measureRef = useRef(null);
  const [fit, setFit] = useState(items.length);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return undefined;

    const compute = () => {
      const widths = [...measure.querySelectorAll("[data-item]")].map((node) => node.offsetWidth);
      const more = measure.querySelector("[data-more]").offsetWidth;
      const room = wrap.clientWidth;
      const all = widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1);
      if (all <= room) {
        setFit(items.length);
        return;
      }
      let used = more;
      let count = 0;
      for (const width of widths) {
        if (used + GAP + width > room) break;
        used += GAP + width;
        count += 1;
      }
      setFit(count);
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [items]);

  const shown = items.slice(0, fit);
  const rest = items.slice(fit);

  return (
    <div ref={wrapRef} className="overflow">
      {shown.map((item) => (
        <Button key={item.key} icon={item.icon} onClick={() => onSelect(item.key)}>{item.label}</Button>
      ))}
      {rest.length ? (
        <Popover label={shown.length ? "More" : "Actions"} icon={faEllipsis} labelAlways>
          {({ close }) => (
            <ul className="dt__list">
              {rest.map((item) => (
                <li key={item.key}>
                  <Button
                    icon={item.icon}
                    className="admin-button--menu"
                    onClick={() => {
                      close();
                      onSelect(item.key);
                    }}
                  >
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      ) : null}

      <div ref={measureRef} className="overflow__measure" aria-hidden="true">
        {items.map((item) => (
          <span key={item.key} data-item>
            <Button icon={item.icon} tabIndex={-1}>{item.label}</Button>
          </span>
        ))}
        <span data-more>
          <Button icon={faEllipsis} tabIndex={-1}>More</Button>
        </span>
      </div>
    </div>
  );
}
