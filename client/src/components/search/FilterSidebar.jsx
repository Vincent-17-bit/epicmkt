import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronLeft, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import styles from "./ProductSearch.module.css";

const SHOWN = 7;

// The filter column, Amazon style: a bold heading per filter, a short list with "See more", counts beside each option.
// Every change goes through `onChange(field, value)` so the page keeps the whole search in its address.
export default function FilterSidebar({ facets, search, onToggle, onKind, onPrice, onClear, activeCount }) {
  return (
    <div className={styles.filters}>
      {activeCount > 0 && (
        <button type="button" className={styles.clearAll} onClick={onClear}>
          Clear all filters ({activeCount})
        </button>
      )}
      {facets.map((facet) => {
        if (facet.type === "links") return <KindLinks key={facet.id} facet={facet} search={search} onKind={onKind} />;
        if (facet.type === "price") return <PriceFacet key={facet.id} facet={facet} search={search} onPrice={onPrice} />;
        if (facet.type === "swatch") return <SwatchFacet key={facet.id} facet={facet} onToggle={onToggle} />;
        return <CheckFacet key={facet.id} facet={facet} onToggle={onToggle} />;
      })}
    </div>
  );
}

function Group({ title, children, id }) {
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h3 id={id} className={styles.groupTitle}>{title}</h3>
      {children}
    </section>
  );
}

function MoreToggle({ open, onClick, controls }) {
  return (
    <button type="button" className={styles.more} aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} aria-hidden="true" /> {open ? "See less" : "See more"}
    </button>
  );
}

function KindLinks({ facet, search, onKind }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const values = open ? facet.values : facet.values.slice(0, SHOWN);
  return (
    <Group title={facet.label} id={`${uid}-h`}>
      {search.kind && (
        <button type="button" className={styles.back} onClick={() => onKind("")}>
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Any department
        </button>
      )}
      <ul id={`${uid}-l`} className={styles.links}>
        {values.map((v) => (
          <li key={v.id}>
            <button type="button" className={v.selected ? styles.linkOn : styles.link} aria-current={v.selected ? "true" : undefined} onClick={() => onKind(v.selected ? "" : v.id)}>
              {v.label} <span className={styles.count}>({v.count})</span>
            </button>
          </li>
        ))}
      </ul>
      {facet.values.length > SHOWN && <MoreToggle open={open} controls={`${uid}-l`} onClick={() => setOpen((o) => !o)} />}
    </Group>
  );
}

function CheckFacet({ facet, onToggle }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const picked = facet.values.filter((v) => v.selected);
  // A ticked option stays visible even when the list is folded.
  const values = open ? facet.values : [...facet.values.slice(0, SHOWN), ...picked.filter((v) => facet.values.indexOf(v) >= SHOWN)];
  return (
    <Group title={facet.label} id={`${uid}-h`}>
      <ul id={`${uid}-l`} className={styles.checks}>
        {values.map((v) => (
          <li key={v.id}>
            <label className={styles.check}>
              <input type="checkbox" checked={v.selected} onChange={() => onToggle(facet.id, v.id)} />
              <span>{v.label}</span>
              <span className={styles.count} aria-label={`${v.count} results`}>({v.count})</span>
            </label>
          </li>
        ))}
      </ul>
      {facet.values.length > SHOWN && <MoreToggle open={open} controls={`${uid}-l`} onClick={() => setOpen((o) => !o)} />}
    </Group>
  );
}

function SwatchFacet({ facet, onToggle }) {
  const uid = useId();
  return (
    <Group title={facet.label} id={`${uid}-h`}>
      <div className={styles.swatches} role="group" aria-labelledby={`${uid}-h`}>
        {facet.values.map((v) => (
          <button
            key={v.id}
            type="button"
            className={styles.swatch}
            data-multi={v.hex ? undefined : ""}
            style={v.hex ? { "--sw": v.hex } : undefined}
            aria-pressed={v.selected}
            aria-label={`${v.label}, ${v.count} results`}
            title={`${v.label} (${v.count})`}
            onClick={() => onToggle(facet.id, v.id)}
          />
        ))}
      </div>
    </Group>
  );
}

function PriceFacet({ facet, search, onPrice }) {
  const uid = useId();
  const [min, setMin] = useState(search.min ?? "");
  const [max, setMax] = useState(search.max ?? "");
  const submit = (event) => {
    event.preventDefault();
    const n = (v) => (/^\d{1,9}$/.test(String(v).trim()) ? Number(String(v).trim()) : null);
    onPrice({ min: n(min), max: n(max), price: "" });
  };
  const anyPrice = search.price || search.min !== null || search.max !== null;
  return (
    <Group title={facet.label} id={`${uid}-h`}>
      {anyPrice && (
        <button type="button" className={styles.back} onClick={() => { setMin(""); setMax(""); onPrice({ min: null, max: null, price: "" }); }}>
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Any price
        </button>
      )}
      <ul className={styles.links}>
        {facet.values.map((v) => (
          <li key={v.id}>
            <button type="button" className={v.selected ? styles.linkOn : styles.link} aria-current={v.selected ? "true" : undefined} onClick={() => onPrice({ price: v.selected ? "" : v.id, min: null, max: null })}>
              {v.label}
            </button>
          </li>
        ))}
      </ul>
      <form className={styles.priceForm} onSubmit={submit} aria-label="Your own price range">
        <label className="sr-only" htmlFor={`${uid}-min`}>Minimum price in KES</label>
        <input id={`${uid}-min`} inputMode="numeric" placeholder={facet.bounds ? `KES ${facet.bounds.min.toLocaleString("en-KE")}` : "Min"} value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ""))} />
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`${uid}-max`}>Maximum price in KES</label>
        <input id={`${uid}-max`} inputMode="numeric" placeholder={facet.bounds ? `KES ${facet.bounds.max.toLocaleString("en-KE")}` : "Max"} value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ""))} />
        <button type="submit" className={styles.go}>Go</button>
      </form>
    </Group>
  );
}
