import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPhone,
  faLocationArrow,
  faLocationDot,
  faStar,
  faRotateRight,
  faShareNodes,
  faFlag,
  faTag,
  faMap
} from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, distanceKm, formatDistance, formatKes, slugify, telLink, visibleFields, whatsappLink } from "@epicmkt/shared";
import { getBusiness, logContactEvent } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { DAY_NAMES, WEEK, expiryText, formatTime, socialLinks, statusText, todayKey } from "../lib/businessView.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import TemplateDetails from "../components/TemplateDetails.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import ItemDetail from "../components/ItemDetail.jsx";
import FlashStrip from "../components/FlashStrip.jsx";
import Lightbox from "../components/Lightbox.jsx";
import QrCode from "../components/QrCode.jsx";
import ReportDialog from "../components/ReportDialog.jsx";
import { FeaturedBadge, VerifiedBadge } from "../components/Badges.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Business.module.css";

const mapSrc = (lat, lng) => {
  const d = 0.004;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
};

function groupServices(services) {
  const groups = [];
  services.forEach((svc) => {
    const id = svc.section ? slugify(svc.section) : null;
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, name: svc.section ?? null, items: [] };
      groups.push(group);
    }
    group.items.push(svc);
  });
  return groups;
}

function Section({ title, children, id }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Business() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const itemId = searchParams.get("item");
  const [lightbox, setLightbox] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const geo = useGeoStore();
  const [live, setLive] = useState(null);

  useEffect(() => {
    if (geo.status !== "granted" || geo.source !== "device") return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLive({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [geo.status, geo.source]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["business", slug],
    queryFn: () => getBusiness(slug),
    retry: false
  });

  usePageTitle(data ? `${data.name} | ${data.category?.name ?? ""}`.replace(/ \| $/, "") : undefined);

  const sectionId = searchParams.get("section");
  const [hit, setHit] = useState(null);
  useEffect(() => {
    if (!data || !sectionId) return undefined;
    const node = document.getElementById(`section-${sectionId}`);
    if (!node) return undefined;
    node.scrollIntoView({ block: "start" });
    setHit(sectionId);
    const timer = setTimeout(() => setHit(null), 2500);
    return () => clearTimeout(timer);
  }, [data, sectionId]);

  const openItem = (id) => setSearchParams({ item: id }, { state: { sheetFrom: "page" } });
  const swapItem = (id) => setSearchParams({ item: id }, { replace: true, state: location.state });
  const closeItem = () => {
    if (location.state?.sheetFrom === "page") navigate(-1);
    else
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("item");
          return next;
        },
        { replace: true }
      );
  };

  if (isError && error?.name === "NotFoundError") return <NotFound />;

  if (isError) {
    return (
      <Container className={styles.state} role="alert">
        <p>We could not load this business.</p>
        <Button icon={faRotateRight} onClick={() => refetch()}>
          Try again
        </Button>
      </Container>
    );
  }

  if (isPending) {
    return (
      <div aria-busy="true">
        <Container className={styles.crumbRow}>
          <PageBreadcrumbs />
        </Container>
        <Skeleton height="clamp(10rem, 32vw, 18rem)" radius="0" />
        <Container className={styles.page}>
          <Skeleton height="1.5rem" width="60%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="44px" radius="var(--radius-pill)" />
        </Container>
      </div>
    );
  }

  const icon = categoryIcon(data.category?.icon);
  const track = (type) => () => logContactEvent({ businessId: data.id, type });
  const shortUrl = `${window.location.origin}/s/${data.shortcode}`;
  const today = todayKey();
  const origin = live ?? geo.coords;
  const distance = origin ? distanceKm(origin, data) : null;
  const hasDetails = visibleFields(data.category?.fields, data.attributes).some((f) => f.key in (data.attributes ?? {}));
  const socials = socialLinks(data.socials);
  const reviews = data.reviewCount > 0 ? `${data.rating.toFixed(1)} (${data.reviewCount})` : "New";

  const share = async () => {
    const payload = { title: data.name, text: `${data.name} on EpicMKT`, url: shortUrl };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(shortUrl);
      setShareNote("Link copied");
    } catch (err) {
      if (err?.name !== "AbortError") setShareNote("Could not share");
    }
    window.setTimeout(() => setShareNote(""), 2500);
  };

  const whatsappHref = whatsappLink(data.whatsapp, `Hi ${data.name}, I found you on EpicMKT.`);
  const external = { target: "_blank", rel: "noopener noreferrer" };

  return (
    <article className={styles.root} style={{ "--hue": data.hue ?? 210 }}>
      <Container className={styles.crumbRow} {...(itemId ? { inert: "", "aria-hidden": true } : {})}>
        <PageBreadcrumbs />
      </Container>
      <header className={styles.hero}>
        <div className={styles.cover}>
          {data.coverUrl ? <img src={data.coverUrl} alt="" className={styles.coverImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
        </div>
        <Container className={styles.heroInner}>
          <span className={styles.logo}>
            {data.logoUrl ? <img src={data.logoUrl} alt={`${data.name} logo`} className={styles.logoImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
          </span>
          <div className={styles.titles}>
            <h1 className={styles.name}>{data.name}</h1>
            <p className={styles.where}>
              {data.category?.singular} · {data.area}, {data.county}
            </p>
            {data.tagline && <p className={styles.tagline}>{data.tagline}</p>}
          </div>
        </Container>
      </header>

      <Container className={styles.page}>
        <div className={styles.badges}>
          {data.plan === "premium" && <FeaturedBadge />}
          {data.verified && <VerifiedBadge />}
          <span className={data.isOpen ? styles.open : styles.closed}>{statusText(data)}</span>
          <span className={styles.rating}>
            <FontAwesomeIcon icon={faStar} />
            {reviews}
          </span>
        </div>

        <p className={styles.description}>{data.description}</p>

        <ul className={styles.facts}>
          <li>
            <FontAwesomeIcon icon={faLocationDot} />
            <span>
              {data.address}, {data.area}, {data.county}
            </span>
          </li>
          <li>
            <FontAwesomeIcon icon={faLocationArrow} />
            {distance != null ? (
              <span>
                {formatDistance(distance)} away <span className={styles.note}>(straight line{geo.town ? ` from ${geo.town}` : ""})</span>
              </span>
            ) : (
              <button type="button" className={styles.linkBtn} onClick={geo.request} disabled={geo.status === "asking"}>
                {geo.status === "asking" ? "Finding you" : geo.status === "denied" || geo.status === "unsupported" ? "Choose your town to see distance" : "Show distance from me"}
              </button>
            )}
          </li>
        </ul>

        {data.tags?.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {data.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <Button as="a" href={telLink(data.phone)} icon={faPhone} onClick={track("call")}>
            Call
          </Button>
          <Button as="a" variant="secondary" href={whatsappHref} {...external} icon={faWhatsapp} onClick={track("whatsapp")}>
            WhatsApp
          </Button>
          <Button as="a" variant="secondary" href={directionsLink(data.lat, data.lng)} {...external} icon={faLocationArrow} onClick={track("directions")}>
            Directions
          </Button>
          <Button variant="secondary" icon={faShareNodes} onClick={share}>
            {shareNote || "Share"}
          </Button>
        </div>

        {data.offers.length > 0 && (
          <Section title="Offers" id="offers">
            <ul className={styles.offers}>
              {data.offers.map((offer) => (
                <li key={offer.id} className={styles.offer}>
                  <FontAwesomeIcon icon={faTag} className={styles.offerIcon} />
                  <div>
                    <h3 className={styles.h3}>{offer.title}</h3>
                    <p>{offer.description}</p>
                    <p className={styles.offerMeta}>
                      {expiryText(offer.expiresAt)}
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
          </Section>
        )}

        <FlashStrip id="business-flash-title" businessId={data.id} heat={false} />

        {data.services.length > 0 && (
          <Section title="Services and prices" id="services">
            {groupServices(data.services).map((group) => (
              <div
                key={group.id ?? "all"}
                id={group.id ? `section-${group.id}` : undefined}
                className={group.id && group.id === hit ? styles.sectionHit : undefined}
              >
                {group.name && <h3 className={styles.h3}>{group.name}</h3>}
                <ul className={styles.services}>
                {group.items.map((svc) => (
                  <li key={svc.id} className={styles.service}>
                    <button type="button" className={styles.serviceBtn} onClick={() => openItem(svc.id)} aria-haspopup="dialog">
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
          </Section>
        )}

        {data.gallery.length > 0 && (
          <Section title="Photos" id="photos">
            <ul className={styles.gallery}>
              {data.gallery.map((photo, i) => (
                <li key={photo.id}>
                  <button type="button" className={styles.thumb} onClick={() => setLightbox(i)} aria-label={`Open photo: ${photo.caption}`}>
                    <img src={photo.url} alt={photo.caption} loading="lazy" decoding="async" className={styles.thumbImg} />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {hasDetails && (
          <Section title={`${data.category?.singular} details`} id="details">
            <TemplateDetails fields={data.category.fields} attributes={data.attributes} />
          </Section>
        )}

        <Section title="Opening hours" id="hours">
          <table className={styles.hours}>
            <tbody>
              {WEEK.map((day) => (
                <tr key={day} className={day === today ? styles.today : undefined} aria-current={day === today ? "date" : undefined}>
                  <th scope="row">{DAY_NAMES[day]}</th>
                  <td>{data.hours[day] ? `${formatTime(data.hours[day][0])} to ${formatTime(data.hours[day][1])}` : "Closed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Location" id="location">
          <div className={styles.map}>
            <iframe title={`Map showing ${data.name}`} src={mapSrc(data.lat, data.lng)} loading="lazy" referrerPolicy="no-referrer" className={styles.mapFrame} />
          </div>
          <div className={styles.mapActions}>
            <Button as="a" variant="secondary" icon={faMap} href={directionsLink(data.lat, data.lng)} {...external} onClick={track("directions")}>
              View on map
            </Button>
          </div>
        </Section>

        {socials.length > 0 && (
          <Section title="Follow" id="social">
            <ul className={styles.socials}>
              {socials.map((s) => (
                <li key={s.key}>
                  <a href={s.href} {...external} className={styles.social}>
                    <FontAwesomeIcon icon={s.icon} />
                    <span>{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Share this page" id="qr">
          <div className={styles.qrRow}>
            <QrCode value={shortUrl} label={`QR code linking to ${data.name}`} />
            <div className={styles.qrText}>
              <p>Scan to open this page on another phone.</p>
              <p className={styles.qrLink}>{shortUrl.replace(/^https?:\/\//, "")}</p>
              <Button variant="secondary" size="sm" icon={faShareNodes} onClick={share}>
                {shareNote || "Share"}
              </Button>
            </div>
          </div>
        </Section>

        <p className={styles.report}>
          <button type="button" className={styles.linkBtn} onClick={() => setReporting(true)}>
            <FontAwesomeIcon icon={faFlag} /> Report a problem
          </button>
        </p>
      </Container>

      <nav className={styles.bar} aria-label="Contact actions">
        <a href={telLink(data.phone)} className={styles.barItem} onClick={track("call")}>
          <FontAwesomeIcon icon={faPhone} />
          <span>Call</span>
        </a>
        <a href={whatsappHref} {...external} className={styles.barItem} onClick={track("whatsapp")}>
          <FontAwesomeIcon icon={faWhatsapp} />
          <span>WhatsApp</span>
        </a>
        <a href={directionsLink(data.lat, data.lng)} {...external} className={styles.barItem} onClick={track("directions")}>
          <FontAwesomeIcon icon={faLocationArrow} />
          <span>Directions</span>
        </a>
        <button type="button" className={styles.barItem} onClick={share}>
          <FontAwesomeIcon icon={faShareNodes} />
          <span>{shareNote || "Share"}</span>
        </button>
      </nav>

      <Lightbox items={data.gallery} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      {itemId && (
        <ItemDetail
          business={data}
          itemId={itemId}
          distanceKm={distance}
          onClose={closeItem}
          onSelect={swapItem}
          onReport={() => setReporting(true)}
        />
      )}
      <ReportDialog business={data} open={reporting} onClose={() => setReporting(false)} />
    </article>
  );
}
