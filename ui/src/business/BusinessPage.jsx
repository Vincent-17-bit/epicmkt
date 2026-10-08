import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faLocationDot, faStar, faShareNodes, faFlag } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, formatDistance, telLink, whatsappLink } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import slots from "../slots.module.css";
import Button from "../components/Button.jsx";
import Container from "../components/Container.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { FeaturedBadge, VerifiedBadge } from "../components/Badges.jsx";
import BusinessHero from "./BusinessHero.jsx";
import BusinessSection from "./BusinessSection.jsx";
import Details from "./Details.jsx";
import Offers from "./Offers.jsx";
import Follow from "./Follow.jsx";
import Hours from "./Hours.jsx";
import Location from "./Location.jsx";
import Photos from "./Photos.jsx";
import Services from "./Services.jsx";
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
          <Offers offers={business.offers} formatExpiry={formatExpiry} />
        )}

        {flash}

        {business.services.length > 0 && (
          <Services services={business.services} hitSection={hitSection} mode={mode} onOpenItem={onOpenItem} />
        )}

        {business.gallery.length > 0 && (
          <Photos gallery={business.gallery} mode={mode} onOpen={setLightbox} />
        )}

        {details && (
          <Details title={detailsTitle}>{details}</Details>
        )}

        <Hours rows={hoursRows} />

        <Location name={business.name} lat={business.lat} lng={business.lng} directionsHref={directionsHref} mode={mode} onDirections={track("directions")} />

        {socials.length > 0 && (
          <Follow socials={socials} mode={mode} />
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
