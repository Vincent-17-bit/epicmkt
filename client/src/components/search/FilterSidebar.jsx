import { useEffect, useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronLeft, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import styles from "./ProductSearch.module.css";

const SHOWN = 7;

/**
 * The filter column, Amazon and eBay style: a bold heading per filter, counts beside each option, "See more" on long lists.
 * The search engine decides which filters exist (only those the kind of thing found has, each with at least two values to
 * choose between) and their order (most used first); this only draws them. Every change goes through the page, which keeps
 * the whole search in its address.
 *
 *   handlers  { onToggle(facetId, valueId), onKind(kindId), onPrice({ min, max, price }), onRange(facetId, { min, max } | null) }
 */
export default function FilterSidebar({ facets, search, handlers, onClear, activeCount }) {
  return (
    <div className={styles.filters}>
      {activeCount > 0 && (
        <button type="button" className={styles.clearAll} onClick={onClear}>
          Clear all filters ({activeCount})
        </button>
      )}
      {facets.map((facet) => (
        <FacetGroup key={facet.id} facet={facet}>
          <FacetBody facet={facet} search={search} handlers={handlers} />
        </FacetGroup>
      ))}
    </div>
  );
}

function FacetGroup({ facet, children }) {
  const uid = useId();
  return (
    <section className={styles.group} aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={styles.groupTitle}>{facet.label}</h3>
      {children}
    </section>
  );
}

/** One filter's options, without its heading: used in the column, the phone sheet and the quick-chip panels. */
export function FacetBody({ facet, search, handlers, compact = false }) {
  if (facet.type === "links") return <KindLinks facet={facet} search={search} onKind={handlers.onKind} />;
  if (facet.type === "price") return <PriceFacet facet={facet} search={search} onPrice={handlers.onPrice} />;
  if (facet.type === "range") return <RangeFacet facet={facet} onToggle={handlers.onToggle} onRange={handlers.onRange} />;
  if (facet.type === "swatch") return <SwatchFacet facet={facet} onToggle={handlers.onToggle} />;
  if (facet.sizes) return <SizeChips facet={facet} onToggle={handlers.onToggle} />;
  if (facet.toggle) return <ToggleFacet facet={facet} onToggle={handlers.onToggle} />;
  return <CheckFacet facet={facet} onToggle={handlers.onToggle} open={compact} />;
}

function MoreToggle({ open, onClick, controls, hidden }) {
  return (
    <button type="button" className={styles.more} aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} aria-hidden="true" /> {open ? "See less" : `See ${hidden} more`}
    </button>
  );
}

const Count = ({ n }) => (
  <span className={styles.count} aria-label={`${n} results`}>
    ({n})
  </span>
);

function KindLinks({ facet, search, onKind }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const values = open ? facet.values : facet.values.slice(0, SHOWN);
  return (
    <>
      {search.kind && (
        <button type="button" className={styles.back} onClick={() => onKind("")}>
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Any department
        </button>
      )}
      <ul id={`${uid}-l`} className={styles.links}>
        {values.map((v) => (
          <li key={v.id}>
            <button type="button" className={v.selected ? styles.linkOn : styles.link} aria-current={v.selected ? "true" : undefined} onClick={() => onKind(v.selected ? "" : v.id)}>
              {v.label} <Count n={v.count} />
            </button>
          </li>
        ))}
      </ul>
      {facet.values.length > SHOWN && <MoreToggle open={open} hidden={facet.values.length - SHOWN} controls={`${uid}-l`} onClick={() => setOpen((o) => !o)} />}
    </>
  );
}

function CheckFacet({ facet, onToggle, open: startOpen = false }) {
  const uid = useId();
  const [open, setOpen] = useState(startOpen);
  const picked = facet.values.filter((v) => v.selected);
  // A ticked option stays visible even when the list is folded.
  const values = open ? facet.values : [...facet.values.slice(0, SHOWN), ...picked.filter((v) => facet.values.indexOf(v) >= SHOWN)];
  return (
    <>
      <ul id={`${uid}-l`} className={styles.checks}>
        {values.map((v) => (
          <li key={v.id}>
            <label className={styles.check}>
              <input type="checkbox" checked={v.selected} onChange={() => onToggle(facet.id, v.id)} />
              <span className={styles.checkLabel}>{v.label}</span>
              <Count n={v.count} />
            </label>
          </li>
        ))}
      </ul>
      {facet.values.length > SHOWN && <MoreToggle open={open} hidden={facet.values.length - SHOWN} controls={`${uid}-l`} onClick={() => setOpen((o) => !o)} />}
    </>
  );
}

// Yes/no filters ("Open now", "Free delivery") as switches.
function ToggleFacet({ facet, onToggle }) {
  return (
    <ul className={styles.checks}>
      {facet.values.map((v) => (
        <li key={v.id}>
          <label className={styles.toggle}>
            <span className={styles.checkLabel}>
              {v.label} <Count n={v.count} />
            </span>
            <input type="checkbox" role="switch" checked={v.selected} onChange={() => onToggle(facet.id, v.id)} />
          </label>
        </li>
      ))}
    </ul>
  );
}

// Clothes sizes as chips (XS, S, M, L ...), the way shops show them.
function SizeChips({ facet, onToggle }) {
  return (
    <div className={styles.sizeChips} role="group" aria-label={facet.label}>
      {facet.values.map((v) => (
        <button key={v.id} type="button" className={styles.sizeChip} aria-pressed={v.selected} aria-label={`${v.label}, ${v.count} results`} onClick={() => onToggle(facet.id, v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

// Colours with their names and counts, not bare squares: "Black (12)".
function SwatchFacet({ facet, onToggle }) {
  return (
    <ul className={styles.swatchList}>
      {facet.values.map((v) => (
        <li key={v.id}>
          <button type="button" className={styles.swatchBtn} aria-pressed={v.selected} onClick={() => onToggle(facet.id, v.id)}>
            <span className={styles.swatchDot} data-multi={v.hex ? undefined : ""} data-light={v.hex === "#ffffff" ? "" : undefined} style={v.hex ? { "--sw": v.hex } : undefined} aria-hidden="true" />
            <span className={styles.checkLabel}>{v.label}</span>
            <Count n={v.count} />
          </button>
        </li>
      ))}
    </ul>
  );
}

const plainNumber = (v) => {
  const t = String(v).trim().replace(/,/g, "");
  return /^\d{1,7}(?:\.\d{1,3})?$/.test(t) ? Number(t) : null;
};
const fmt = (n) => Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 });

// Your own min and max, with the unit beside the boxes ("kg", "L", "GB", "cc").
function MinMax({ id, unit, bounds, value, onSubmit, label, wholeNumbers = false }) {
  const [min, setMin] = useState(value?.min ?? "");
  const [max, setMax] = useState(value?.max ?? "");
  useEffect(() => {
    setMin(value?.min ?? "");
    setMax(value?.max ?? "");
  }, [value?.min, value?.max]);
  const clean = (s) => s.replace(wholeNumbers ? /[^\d]/g : /[^\d.]/g, "");
  const submit = (event) => {
    event.preventDefault();
    onSubmit({ min: plainNumber(min), max: plainNumber(max) });
  };
  const prefix = unit === "KES" || unit === "EU";
  const box = (which, val, set, bound) => (
    <span className={styles.unitBox}>
      {prefix && <span className={styles.unit} aria-hidden="true">{unit}</span>}
      <label className="sr-only" htmlFor={`${id}-${which}`}>{`${which === "min" ? "Minimum" : "Maximum"} ${label.toLowerCase()}${unit ? ` in ${unit}` : ""}`}</label>
      <input id={`${id}-${which}`} inputMode={wholeNumbers ? "numeric" : "decimal"} placeholder={bound === undefined ? (which === "min" ? "Min" : "Max") : fmt(bound)} value={val} onChange={(e) => set(clean(e.target.value))} />
      {!prefix && unit && <span className={styles.unit} aria-hidden="true">{unit}</span>}
    </span>
  );
  return (
    <form className={styles.priceForm} onSubmit={submit} aria-label={`Your own ${label.toLowerCase()} range`}>
      {box("min", min, setMin, bounds?.min)}
      <span aria-hidden="true">–</span>
      {box("max", max, setMax, bounds?.max)}
      <button type="submit" className={styles.go}>Go</button>
    </form>
  );
}

function RangeFacet({ facet, onToggle, onRange }) {
  const uid = useId();
  return (
    <>
      {facet.range && (
        <button type="button" className={styles.back} onClick={() => onRange(facet.id, null)}>
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Any {facet.label.toLowerCase()}
        </button>
      )}
      {facet.values.length > 1 && (
        <ul className={styles.checks}>
          {facet.values.map((v) => (
            <li key={v.id}>
              <label className={styles.check}>
                <input type="checkbox" checked={v.selected} onChange={() => onToggle(facet.id, v.id)} />
                <span className={styles.checkLabel}>{v.label}</span>
                <Count n={v.count} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <MinMax id={uid} unit={facet.unit} bounds={facet.bounds} value={facet.range} label={facet.label} onSubmit={(r) => onRange(facet.id, r.min === null && r.max === null ? null : r)} />
    </>
  );
}

function PriceFacet({ facet, search, onPrice }) {
  const uid = useId();
  const anyPrice = search.price || search.min !== null || search.max !== null;
  return (
    <>
      {anyPrice && (
        <button type="button" className={styles.back} onClick={() => onPrice({ min: null, max: null, price: "" })}>
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Any price
        </button>
      )}
      {facet.values.length > 0 && (
        <ul className={styles.links}>
          {facet.values.map((v) => (
            <li key={v.id}>
              <button type="button" className={v.selected ? styles.linkOn : styles.link} aria-current={v.selected ? "true" : undefined} onClick={() => onPrice({ price: v.selected ? "" : v.id, min: null, max: null })}>
                {v.label} <Count n={v.count} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <MinMax
        id={uid}
        unit="KES"
        wholeNumbers
        bounds={facet.bounds}
        value={search.min !== null || search.max !== null ? { min: search.min, max: search.max } : null}
        label="Price"
        onSubmit={({ min, max }) => onPrice({ min: min === null ? null : Math.round(min), max: max === null ? null : Math.round(max), price: "" })}
      />
    </>
  );
}
