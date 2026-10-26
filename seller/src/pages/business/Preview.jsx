import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faStore } from "@fortawesome/free-solid-svg-icons";
import { BusinessPage, BusinessPageSkeleton, ProductCard } from "@epicmkt/ui";
import { chipOf, dealOf, flashPrice, formatInstant, isListed, offersByItem, statusOf } from "@epicmkt/shared";
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

const endsText = (iso) => `Ends ${formatInstant(iso, { locale: "en-KE", weekday: "short", hour: "numeric", minute: "2-digit" })}`;

const serviceOf = (item, chips) => ({
  offer: chips.get(item.id) ?? null,
  id: item.id,
  name: item.name,
  description: item.description ?? "",
  priceKes: item.price,
  priceType: item.priceType,
  unit: item.unit,
  section: item.section,
  status: "listed",
  availability: item.availability,
  stockLeft: item.trackStock && item.showStockCount && item.stockCount > 0 ? item.stockCount : null,
  imageUrl: mediaUrl(item.imagePaths?.[0]),
});

const flashCards = (flashSales, items) =>
  flashSales
    .map((sale) => {
      const item = items.find((i) => i.id === sale.itemId);
      if (!item || !isListed(item) || !Number.isFinite(item.price)) return null;
      const salePrice = flashPrice(sale.discountType, sale.discountValue, item.price);
      const savings = item.price - salePrice;
      return {
        sale,
        card: {
          id: item.id,
          name: item.name,
          imageUrl: mediaUrl(item.imagePaths?.[0]),
          availability: item.availability,
          stockLeft: item.trackStock && item.showStockCount && item.stockCount > 0 ? item.stockCount : null,
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

  const { shop, items, flashSales, offers = [] } = preview.data;
  const nowMs = Date.now();
  const chips = new Map([...offersByItem(offers)].map(([id, list]) => [id, chipOf(list, nowMs)]).filter(([, c]) => c).map(([id, c]) => [id, { label: c.label, extra: c.extra }]));
  const deals = offers
    .map((o) => dealOf(o, o.items.map((e) => ({ e, item: items.find((i) => i.id === e.itemId) })).filter((x) => x.item).map(({ e, item }) => ({ id: item.id, name: item.name, imageUrl: mediaUrl(item.imagePaths?.[0]), price: item.price, role: e.role })), nowMs))
    .filter((d) => d.scope === "store" || d.products.length > 0);
  const hours = shop.hours ?? {};
  const exceptions = shop.exceptions ?? [];
  const openStatus = safe(() => statusOf(hours, exceptions), statusOf({}, []));
  const openFields = { isOpen: openStatus.isOpen, closesAt: openStatus.closesAt, opensAt: openStatus.opensAt, statusLine: openStatus.line, openStatus };
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
    offers: deals,
    // Exactly what customers get: sold-out items are not listed.
    services: items.filter(isListed).map((i) => serviceOf(i, chips)),
    // Same functions and same data as the customer page, so the preview cannot disagree with it.
    ...openFields,
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
          offerLabels={{ title: "Offers", code: "Code", copy: "Copy code", copied: "Copied", endsIn: "Ends in", noEnd: "No end date", onlyNow: "Not available at this hour", openProduct: "Open" }}
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
