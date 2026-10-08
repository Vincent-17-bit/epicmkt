import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faLocationDot, faStar, faShareNodes, faFlag, faTag, faMap } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, formatDistance, formatKes, telLink, whatsappLink } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import slots from "../slots.module.css";
import Button from "../components/Button.jsx";
import Container from "../components/Container.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { FeaturedBadge, VerifiedBadge } from "../components/Badges.jsx";
import BusinessHero from "./BusinessHero.jsx";
import BusinessSection from "./BusinessSection.jsx";
import HoursTable from "./HoursTable.jsx";
import { groupServices, mapSrc } from "./groupServices.js";
import styles from "./BusinessPage.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function BusinessPage({
  business,
  icon,
  statusText,
  reviewsText,
  distanceKm,
  fromTown,
  locate,
  hoursRows,
  formatExpiry,
  details,
  detailsTitle,
  flash,
  socials = [],
  qr,
  shortUrl,
  hitSection,
  shareNote,
  crumbInert = false,
  breadcrumbs,
  onContact,
  onShare,
  onOpenItem,
  onReport,
  mode = "live",
  overlay,
  quickActions,
  children
}) {
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const [lightbox, setLightbox] = useState(null);
  const track = (type) => () => onContact?.(business, type);
  const whatsappHref = whatsappLink(business.whatsapp, `Hi ${business.name}, I found you on EpicMKT.`);
  const callHref = telLink(business.phone);
  const directionsHref = directionsLink(business.lat, business.lng);
  const hasSlots = Boolean(overlay || quickActions);

  return (
    <article className={[styles.root, hasSlots && slots.root].filter(Boolean).join(" ") || undefined} style={{ "--hue": business.hue ?? 210 }} data-mode={preview ? "preview" : undefined}>
      {overlay && (
        <div className={slots.overlay} data-slot="overlay">
          {overlay}
        </div>
      )}
      <Container className={styles.crumbRow} {...(crumbInert ? { inert: "", "aria-hidden": true } : {})}>
        {breadcrumbs}
      </Container>
      <BusinessHero business={business} icon={icon} />

      <Container className={styles.page}>
        {quickActions && (
          <div className={slots.quickActions} data-slot="quick-actions">
            {quickActions}
          </div>
        )}
        <div className={styles.badges}>
          {business.plan === "premium" && <FeaturedBadge />}
          {business.verified && <VerifiedBadge />}
          <span className={business.isOpen ? styles.open : styles.closed}>{statusText}</span>
          <span className={styles.rating}>
            <FontAwesomeIcon icon={faStar} />
            {reviewsText}
          </span>
        </div>

        <p className={styles.description}>{business.description}</p>

        <ul className={styles.facts}>
          <li>
            <FontAwesomeIcon icon={faLocationDot} />
            <span>
              {business.address}, {business.area}, {business.county}
            </span>
          </li>
          <li>
            <FontAwesomeIcon icon={faLocationArrow} />
            {distanceKm != null ? (
              <span>
                {formatDistance(distanceKm)} away <span className={styles.note}>(straight line{fromTown ? ` from ${fromTown}` : ""})</span>
              </span>
            ) : (
              <button type="button" className={styles.linkBtn} {...act.button(locate?.onClick)} disabled={preview || locate?.disabled}>
                {locate?.label}
              </button>
            )}
          </li>
        </ul>

        {business.tags?.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {business.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <Button as="a" icon={faPhone} {...act.link(callHref, track("call"))}>
            Call
          </Button>
          <Button as="a" variant="secondary" icon={faWhatsapp} {...act.link(whatsappHref, track("whatsapp"), external)}>
            WhatsApp
          </Button>
          <Button as="a" variant="secondary" icon={faLocationArrow} {...act.link(directionsHref, track("directions"), external)}>
            Directions
          </Button>
          <Button variant="secondary" icon={faShareNodes} {...act.button(onShare)}>
            {shareNote || "Share"}
          </Button>
        </div>

        {business.offers.length > 0 && (
          <BusinessSection title="Offers" id="offers">
            <ul className={styles.offers}>
              {business.offers.map((offer) => (
                <li key={offer.id} className={styles.offer}>
                  <FontAwesomeIcon icon={faTag} className={styles.offerIcon} />
                  <div>
                    <h3 className={styles.h3}>{offer.title}</h3>
                    <p>{offer.description}</p>
                    <p className={styles.offerMeta}>
                      {formatExpiry?.(offer.expiresAt)}
                      {offer.code && (
                        <>
                          {" · Code "}
                          <strong>{offer.code}</strong>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </BusinessSection>
        )}

        {flash}

        {business.services.length > 0 && (
          <BusinessSection title="Services and prices" id="services">
            {groupServices(business.services).map((group) => (
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
        )}

        {business.gallery.length > 0 && (
          <BusinessSection title="Photos" id="photos">
            <ul className={styles.gallery}>
              {business.gallery.map((photo, i) => (
                <li key={photo.id}>
                  <button type="button" className={styles.thumb} {...act.button(() => setLightbox(i))} aria-label={`Open photo: ${photo.caption}`}>
                    <img src={photo.url} alt={photo.caption} loading="lazy" decoding="async" className={styles.thumbImg} />
                  </button>
                </li>
              ))}
            </ul>
          </BusinessSection>
        )}

        {details && (
          <BusinessSection title={detailsTitle} id="details">
            {details}
          </BusinessSection>
        )}

        <BusinessSection title="Opening hours" id="hours">
          <HoursTable rows={hoursRows} />
        </BusinessSection>

        <BusinessSection title="Location" id="location">
          <div className={styles.map}>
            <iframe
              title={`Map showing ${business.name}`}
              src={mapSrc(business.lat, business.lng)}
              loading="lazy"
              referrerPolicy="no-referrer"
              className={styles.mapFrame}
              {...(preview ? { inert: "" } : {})}
            />
          </div>
          <div className={styles.mapActions}>
            <Button as="a" variant="secondary" icon={faMap} {...act.link(directionsHref, track("directions"), external)}>
              View on map
            </Button>
          </div>
        </BusinessSection>

        {socials.length > 0 && (
          <BusinessSection title="Follow" id="social">
            <ul className={styles.socials}>
              {socials.map((s) => (
                <li key={s.key}>
                  <a className={styles.social} {...act.link(s.href, undefined, external)}>
                    <FontAwesomeIcon icon={s.icon} />
                    <span>{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </BusinessSection>
        )}

        <BusinessSection title="Share this page" id="qr">
          <div className={styles.qrRow}>
            {qr}
            <div className={styles.qrText}>
              <p>Scan to open this page on another phone.</p>
              <p className={styles.qrLink}>{shortUrl.replace(/^https?:\/\//, "")}</p>
              <Button variant="secondary" size="sm" icon={faShareNodes} {...act.button(onShare)}>
                {shareNote || "Share"}
              </Button>
            </div>
          </div>
        </BusinessSection>

        <p className={styles.report}>
          <button type="button" className={styles.linkBtn} {...act.button(onReport)}>
            <FontAwesomeIcon icon={faFlag} /> Report a problem
          </button>
        </p>
      </Container>

      <nav className={styles.bar} aria-label="Contact actions">
        <a className={styles.barItem} {...act.link(callHref, track("call"))}>
          <FontAwesomeIcon icon={faPhone} />
          <span>Call</span>
        </a>
        <a className={styles.barItem} {...act.link(whatsappHref, track("whatsapp"), external)}>
          <FontAwesomeIcon icon={faWhatsapp} />
          <span>WhatsApp</span>
        </a>
        <a className={styles.barItem} {...act.link(directionsHref, track("directions"), external)}>
          <FontAwesomeIcon icon={faLocationArrow} />
          <span>Directions</span>
        </a>
        <button type="button" className={styles.barItem} {...act.button(onShare)}>
          <FontAwesomeIcon icon={faShareNodes} />
          <span>{shareNote || "Share"}</span>
        </button>
      </nav>

      <Lightbox items={business.gallery} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      {children}
    </article>
  );
}
