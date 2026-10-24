import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faStore } from "@fortawesome/free-solid-svg-icons";
import { BusinessPage, BusinessPageSkeleton, ProductCard } from "@epicmkt/ui";
import { closingInfo, flashPrice, isOpenOn } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import ShopQr from "../../components/ShopQr.jsx";
import { errorText } from "../../lib/errors.js";
import { hoursRows, socialLinks, statusText } from "../../lib/shopView.js";
import ui from "../../styles/ui.module.css";
import styles from "./Preview.module.css";

const NOT_LIVE = {
  paused: "Your shop is paused.",
  suspended: "Your shop is suspended.",
  expired: "Your subscription has ended.",
};

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const endsText = (iso) => `Ends ${new Date(iso).toLocaleString("en-KE", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" })}`;

const serviceOf = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description ?? "",
  priceKes: item.price,
  priceType: item.priceType,
  unit: item.unit,
  section: item.section,
  status: "listed",
  availability: item.availability,
  imageUrl: mediaUrl(item.imagePaths?.[0]),
});

const flashCards = (flashSales, items) =>
  flashSales
    .map((sale) => {
      const item = items.find((i) => i.id === sale.itemId);
      if (!item || !Number.isFinite(item.price)) return null;
      const salePrice = flashPrice(sale.discountType, sale.discountValue, item.price);
      const savings = item.price - salePrice;
      return {
        sale,
        card: {
          id: item.id,
          name: item.name,
          imageUrl: mediaUrl(item.imagePaths?.[0]),
          availability: item.availability === "limited_stock" ? "limited" : item.availability === "available" ? "available" : "unavailable",
          pricing: { regularPrice: item.price, salePrice, savings, discountPercent: item.price > 0 ? Math.round((savings / item.price) * 100) : 0 },
        },
      };
    })
    .filter(Boolean);

function FlashSection({ cards }) {
  if (cards.length === 0) return null;
  return (
    <section className={styles.flash} aria-labelledby="preview-flash-title">
      <h3 id="preview-flash-title" className={styles.flashTitle}>
        <FontAwesomeIcon icon={faBolt} aria-hidden="true" /> Flash sales at this store
      </h3>
      <ul className={styles.flashList}>
        {cards.map(({ sale, card }) => (
          <li key={sale.id} className={styles.flashItem}>
            <ProductCard item={card} mode="preview" />
            <p className={styles.flashNote}>{sale.headline ? `${sale.headline}. ` : ""}{endsText(sale.endsAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Preview() {
  const preview = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false });

  const back = <Link to="/business/catalog" className={styles.back}>Back to My listings</Link>;

  if (preview.isPending) return <div className={styles.wrap}>{back}<BusinessPageSkeleton breadcrumbs={null} /></div>;
  if (preview.isError) {
    return (
      <div className={styles.wrap}>
        {back}
        <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
          <h2>We could not load your preview</h2>
          <p>{errorText(preview.error)}</p>
          <button type="button" className={styles.retry} onClick={() => preview.refetch()}>Try again</button>
        </div>
      </div>
    );
  }

  const { shop, items, flashSales } = preview.data;
  const hours = shop.hours ?? {};
  const exceptions = shop.exceptions ?? [];
  const business = {
    id: shop.slug,
    slug: shop.slug,
    shortcode: shop.slug,
    name: shop.name,
    tagline: shop.tagline,
    description: shop.description,
    category: { singular: shop.categoryName },
    county: shop.county,
    area: shop.town,
    address: shop.address,
    lat: shop.lat,
    lng: shop.lng,
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    socials: shop.socials,
    hours,
    exceptions,
    tags: shop.tags,
    plan: shop.planKey,
    verified: shop.verified,
    hue: 210,
    coverUrl: mediaUrl(shop.coverPath),
    logoUrl: mediaUrl(shop.logoPath),
    gallery: [],
    offers: [],
    services: items.map(serviceOf),
    // Same functions and same data as the customer page, so the preview cannot disagree with it.
    isOpen: safe(() => isOpenOn(hours, exceptions), false),
    ...safe(() => closingInfo(hours, exceptions), { closesAt: null, opensAt: null }),
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        {back}
        <p className={styles.note} role="status">Preview. This is how customers see your shop. Buttons do not work here.</p>
      </div>
      {!shop.live && (
        <div className={`${ui.banner} ${ui.tone_warning}`} role="alert" data-testid="preview-not-live">
          <h2>Customers cannot see your shop right now</h2>
          <p>{NOT_LIVE[shop.status] ?? "Your shop is not live."} This preview shows what they will see once it is live again.</p>
        </div>
      )}
      <div className={styles.page} data-testid="shop-preview">
        <BusinessPage
          mode="preview"
          business={business}
          icon={faStore}
          statusText={statusText(business)}
          reviewsText="New"
          distanceKm={null}
          locate={{ label: "Show distance from me" }}
          hoursRows={hoursRows(hours, exceptions)}
          formatExpiry={() => ""}
          flash={<FlashSection cards={flashCards(flashSales, items)} />}
          socials={socialLinks(shop.socials)}
          qr={<ShopQr slug={shop.slug} planKey={shop.planKey} hasLogo={!!shop.logoPath} label={`QR code linking to ${shop.name}`} />}
          shortUrl={`/s/${shop.slug}`}
          shareNote=""
          breadcrumbs={null}
        />
      </div>
    </div>
  );
}
