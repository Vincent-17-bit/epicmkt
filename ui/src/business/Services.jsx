import { useMemo, useState } from "react";
import { formatKes } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import LazyImage from "../components/LazyImage.jsx";
import OfferChip from "../components/OfferChip.jsx";
import BusinessSection from "./BusinessSection.jsx";
import { groupServices } from "./groupServices.js";
import ServiceFilter from "./ServiceFilter.jsx";
import { EMPTY_FILTERS, applyServiceFilters, buildFacets, countActive } from "./serviceFilters.js";
import styles from "./Services.module.css";

export default function Services({ services, hitSection, mode = "live", onOpenItem }) {
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const facets = useMemo(() => buildFacets(services), [services]);
  const filtered = useMemo(() => applyServiceFilters(services, filters), [services, filters]);
  const active = countActive(filters);
  const sorted = filters.sort !== "default";
  const canFilter = services.length > 1;

  return (
    <BusinessSection
      title="Services and prices"
      id="services"
      action={canFilter ? <ServiceFilter facets={facets} filters={filters} onChange={setFilters} disabled={preview} /> : null}
    >
      {active > 0 && (
        <p className={styles.status} role="status">
          Showing {filtered.length} of {services.length}
          <button type="button" className={styles.reset} onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </p>
      )}
      {filtered.length === 0 && (
        <p className={styles.empty}>Nothing matches those filters.</p>
      )}
      {(sorted ? [{ id: null, name: null, items: filtered }] : groupServices(filtered)).map((group) => (
        <div
          key={group.id ?? "all"}
          id={group.id ? `section-${group.id}` : undefined}
          className={group.id && group.id === hitSection ? styles.sectionHit : undefined}
        >
          {group.name && <h3 className={styles.h3}>{group.name}</h3>}
          <ul className={styles.services}>
            {group.items.map((svc) => (
              <li key={svc.id} className={styles.service}>
                <button type="button" className={styles.serviceBtn} {...act.button(() => onOpenItem?.(svc.id))} aria-haspopup="dialog">
                  <span className={styles.serviceMedia}>
                    <LazyImage src={svc.imageUrl} ratio="4 / 3" className={styles.serviceImg} width={480} />
                    <OfferChip offer={svc.offer} className={styles.serviceOffer} />
                  </span>
                  <span className={styles.serviceText}>
                    <span className={styles.h3}>{svc.name}</span>
                    {Number.isFinite(svc.priceKes) && <span className={styles.price}>{formatKes(svc.priceKes)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </BusinessSection>
  );
}
