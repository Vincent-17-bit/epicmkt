import { formatKes } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import BusinessSection from "./BusinessSection.jsx";
import { groupServices } from "./groupServices.js";
import styles from "./Services.module.css";

export default function Services({ services, hitSection, mode = "live", onOpenItem }) {
  const act = actionProps(isPreview(mode));

  return (
    <BusinessSection title="Services and prices" id="services">
      {groupServices(services).map((group) => (
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
                  {svc.imageUrl && <img src={svc.imageUrl} alt="" loading="lazy" decoding="async" className={styles.serviceImg} />}
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
