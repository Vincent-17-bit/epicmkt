import { useEffect, useMemo, useState } from "react";
import { formatKes, listedOnly, slugify } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import LazyImage from "../components/LazyImage.jsx";
import OfferChip from "../components/OfferChip.jsx";
import StockTag from "../components/StockTag.jsx";
import BusinessSection from "./BusinessSection.jsx";
import { groupServices } from "./groupServices.js";
import ServiceFilter from "./ServiceFilter.jsx";
import { EMPTY_FILTERS, PAGE_SIZE, applyServiceFilters, buildFacets, countActive, searchServices } from "./serviceFilters.js";
import styles from "./Services.module.css";

export default function Services({ services: all, count, hitSection, focusSection, focusItem, mode = "live", onOpenItem, labels }) {
  // Out of stock items are not listed to customers. The database already leaves them out; this keeps one from showing.
  const services = useMemo(() => listedOnly(all), [all]);
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const facets = useMemo(() => buildFacets(services), [services]);
  const filtered = useMemo(() => applyServiceFilters(searchServices(services, query), filters), [services, query, filters]);
  const active = countActive(filters);
  const searching = query.trim() !== "";
  const sorted = filters.sort !== "default";
  const canFilter = services.length > 1;
  const total = count ?? services.length;

  useEffect(() => {
    const id = setTimeout(() => setQuery(text), 150);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [query, filters]);

  const ordered = useMemo(() => (sorted ? filtered : groupServices(filtered).flatMap((g) => g.items)), [filtered, sorted]);
  const needed = useMemo(() => {
    if (searching || active > 0) return 0;
    const itemAt = focusItem ? ordered.findIndex((svc) => svc.id === focusItem) : -1;
    const sectionAt = focusSection ? ordered.findIndex((svc) => svc.section && slugify(svc.section) === focusSection) : -1;
    const at = Math.max(itemAt, sectionAt);
    return at < 0 ? 0 : Math.ceil((at + 1) / PAGE_SIZE) * PAGE_SIZE;
  }, [ordered, searching, active, focusItem, focusSection]);
  const limit = Math.max(shown, needed);
  const visible = ordered.slice(0, limit);
  const groups = sorted ? [{ id: null, name: null, items: visible }] : groupServices(visible);
  const remaining = ordered.length - visible.length;

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setText("");
    setQuery("");
  };

  return (
    <BusinessSection
      title={`All products (${total})`}
      id="services"
      action={canFilter ? <ServiceFilter facets={facets} filters={filters} onChange={setFilters} disabled={preview} /> : null}
    >
      {canFilter && (
        <input
          type="search"
          className={styles.search}
          placeholder="Search this store"
          aria-label="Search this store"
          autoComplete="off"
          value={text}
          disabled={preview}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {(active > 0 || searching) && (
        <p className={styles.status} role="status">
          Showing {filtered.length} of {services.length}
          <button type="button" className={styles.reset} onClick={clearAll}>
            Clear
          </button>
        </p>
      )}
      {services.length === 0 && <p className={styles.empty}>No products listed yet.</p>}
      {services.length > 0 && filtered.length === 0 && (
        <p className={styles.empty}>{searching ? "Nothing matches your search." : "Nothing matches those filters."}</p>
      )}
      {groups.map((group) => (
        <div
          key={group.id ?? "all"}
          id={group.id ? `section-${group.id}` : undefined}
          className={[styles.group, group.id && group.id === hitSection && styles.sectionHit].filter(Boolean).join(" ")}
          data-preview={preview ? "" : undefined}
        >
          {group.name && <h3 className={styles.h3}>{group.name}</h3>}
          <ul className={styles.services} data-preview={preview ? "" : undefined}>
            {group.items.map((svc) => (
              <li key={svc.id} className={styles.service}>
                <button type="button" className={styles.serviceBtn} {...act.button(() => onOpenItem?.(svc.id))} aria-haspopup="dialog">
                  <span className={styles.serviceMedia}>
                    <LazyImage src={svc.imageUrl} ratio="4 / 3" className={styles.serviceImg} width={480} />
                    <OfferChip offer={svc.offer} className={styles.serviceOffer} />
                    <StockTag item={svc} labels={labels} className={styles.stockTag} onPicture />
                  </span>
                  <span className={styles.serviceText}>
                    <span className={`${styles.h3} ${styles.serviceName}`}>{svc.name}</span>
                    {Number.isFinite(svc.priceKes) && <span className={styles.price}>{formatKes(svc.priceKes)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {remaining > 0 && (
        <button type="button" className={styles.more} onClick={() => setShown(limit + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </BusinessSection>
  );
}
