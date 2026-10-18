import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faRotateRight, faStore } from "@fortawesome/free-solid-svg-icons";
import { distanceKm, whatsappLink } from "@epicmkt/shared";
import { getBusiness, items, logContactEvent, logEvent } from "../api/index.js";
import { SITE_URL, itemPath } from "../config/breadcrumbs.js";
import { useUrgency } from "../hooks/useCountdown.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useNearViewport } from "../hooks/useNearViewport.js";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import { usePageMeta } from "../hooks/usePageMeta.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { formatEat } from "../lib/flash.js";
import { formatTime, statusText, todayKey } from "../lib/businessView.js";
import { buildSpecGroups, chatMessage, countRows, defaultVariantId, endedPricing, offerTarget, previewText } from "../lib/itemView.js";
import { useGeoStore } from "../stores/geo.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import Container from "../components/Container.jsx";
import ItemGallery from "../components/ItemGallery.jsx";
import OfferStrip from "../components/OfferStrip.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import ReportDialog from "../components/ReportDialog.jsx";
import StoreSelective from "../components/StoreSelective.jsx";
import ItemBottomBar from "../components/item/ItemBottomBar.jsx";
import ItemFlashRow from "../components/item/ItemFlash.jsx";
import ItemMore from "../components/item/ItemMore.jsx";
import ItemPrice from "../components/item/ItemPrice.jsx";
import { About, Additional, DetailsTable, Overview, Section } from "../components/item/ItemSections.jsx";
import ItemSkeleton from "../components/item/ItemSkeleton.jsx";
import { ItemActions, StoreLine, StoreStrip } from "../components/item/ItemStore.jsx";
import ItemTabs from "../components/item/ItemTabs.jsx";
import ItemVariants from "../components/item/ItemVariants.jsx";
import styles from "../components/item/item.module.css";

const MAX_TIMEOUT = 2147483647;
const META_MAX = 160;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function Gone({ slug, onVisit }) {
  return (
    <>
      <section className={`${styles.card} ${styles.state}`}>
        <FontAwesomeIcon icon={faBoxOpen} className={styles.stateIcon} aria-hidden="true" />
        <h1 className={styles.stateTitle}>{t("item.gone")}</h1>
        <p className={styles.text}>{t("item.goneHint")}</p>
        <Link to={`/b/${slug}`} className={styles.outline} onClick={onVisit}>
          <FontAwesomeIcon icon={faStore} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
      </section>
      <section className={`${styles.card} ${styles.more}`}>
        <StoreSelective businessId={slug} businessSlug={slug} excludeItemId={null} level={2} />
      </section>
    </>
  );
}

function ItemView({ slug, itemId }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const geo = useGeoStore();
  const mobile = useMediaQuery("(max-width: 767.98px)");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const moreRef = useRef(null);
  const nearMore = useNearViewport(moreRef);
  const viewed = useRef(false);
  const [choice, setChoice] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [moreState, setMoreState] = useState("pending");

  const { data, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["item", slug, itemId],
    queryFn: () => items.getDetail(itemId, { businessId: slug }),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
  const businessQuery = useQuery({ queryKey: ["business", slug], queryFn: () => getBusiness(slug), retry: false, staleTime: 60_000 });
  const business = businessQuery.data;

  const gone = isError && error?.name === "NotFoundError";
  const failed = isError && !gone && !data;
  const item = gone ? null : data ?? null;

  const flashEndsAt = item?.flash?.sale.endsAt ?? null;
  const urgency = useUrgency(flashEndsAt);
  const flashOver = Boolean(flashEndsAt) && urgency === "ended";
  const flashLive = Boolean(item?.flash) && !flashOver;
  const pricing = item ? (item.flash && !flashLive ? endedPricing(item.pricing) : item.pricing) : null;

  useEffect(() => {
    if (!flashOver) return undefined;
    refetch();
    const id = window.setInterval(() => refetch(), 2000);
    return () => window.clearInterval(id);
  }, [flashOver, flashEndsAt]);

  useEffect(() => {
    if (gone && data) queryClient.invalidateQueries({ queryKey: ["business", slug] });
  }, [gone]);

  useEffect(() => {
    if (!item) return undefined;
    const waits = item.offers.map((view) => view.remainingMs).filter((ms) => Number.isFinite(ms));
    if (!waits.length) return undefined;
    const wait = Math.min(...waits) + 300;
    if (wait > MAX_TIMEOUT) return undefined;
    const id = window.setTimeout(() => refetch(), wait);
    return () => window.clearTimeout(id);
  }, [dataUpdatedAt, item?.id]);

  useEffect(() => {
    if (!item || viewed.current) return;
    viewed.current = true;
    logEvent("item_view", { businessId: item.business.id, itemId: item.id, kind: item.kind, flash: flashLive });
  }, [item?.id]);

  useEffect(() => {
    const url = item?.images?.[0]?.url;
    if (!url) return undefined;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
    return () => link.remove();
  }, [item?.images?.[0]?.url]);

  useItemJsonLd(item ? { ...item, flash: flashLive ? item.flash : null, pricing } : null);

  const seller = item?.business ?? null;
  const canonical = item ? `${SITE_URL}${itemPath(seller.slug, item.id)}` : undefined;
  const metaParts = item
    ? [item.name, seller.name, seller.townName, item.shortDescription].filter(Boolean)
    : [];
  usePageTitle(item ? `${item.name} | ${seller.name}` : gone ? t("item.gone") : undefined);
  usePageMeta({ description: item ? clip(metaParts.join(" · "), META_MAX) : undefined, canonical });

  if (gone) {
    return (
      <div className={styles.page}>
        <Container className={styles.crumbRow}>
          <PageBreadcrumbs />
        </Container>
        <Container className={styles.main}>
          <Gone slug={slug} onVisit={() => logEvent("visit_store_click", { itemId, placement: "gone" })} />
        </Container>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={styles.page}>
        <Container className={styles.crumbRow}>
          <PageBreadcrumbs />
        </Container>
        <Container className={styles.main}>
          <section className={`${styles.card} ${styles.state}`} role="alert">
            <p className={styles.text}>{online ? t("item.loadFailed") : t("item.offline")}</p>
            <button type="button" className={styles.outline} onClick={() => refetch()}>
              <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
              <span>{t("item.retry")}</span>
            </button>
          </section>
        </Container>
      </div>
    );
  }

  if (!item) return <ItemSkeleton />;

  const variants = pricing?.variants ?? [];
  const activeId = choice ?? defaultVariantId(pricing);
  const variant = variants.find((v) => v.id === activeId) ?? null;
  const shown = variant ?? pricing;
  const distance = geo.coords ? distanceKm(geo.coords, seller) : null;
  const chatHref = whatsappLink(seller.whatsapp, chatMessage({ item, variant, pricing }));
  const outOfStock = item.availability === "unavailable";
  const quantityNote = flashLive ? item.flash.sale.quantityNote : null;
  const stockNote = outOfStock ? null : quantityNote || (item.availability === "limited" ? t("item.limitedNote") : null);

  const track = (name, extra) => logEvent(name, { businessId: seller.id, itemId: item.id, ...extra });
  const onChat = (placement) => () => {
    logContactEvent({ businessId: seller.id, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: flashLive });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => logContactEvent({ businessId: seller.id, type: "call" });

  const share = async () => {
    const url = `${window.location.origin}${itemPath(seller.slug, item.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.name, text: `${item.name} ${t("item.shareSuffix")}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(t("item.linkCopied"));
    } catch (err) {
      if (err?.name !== "AbortError") showToast(t("item.shareFailed"));
    }
  };

  const onSeeItems = (offer) => navigate(offerTarget(offer, business ?? { slug: seller.slug }));

  const facts = [
    business?.category?.name && { label: t("item.fact.category"), value: business.category.name },
    item.section && { label: t("item.fact.section"), value: item.section },
    pricing?.unit && { label: t("item.fact.unit"), value: pricing.unit },
    { label: t("item.fact.availability"), value: t(`item.availability.${item.availability}`) }
  ].filter(Boolean);

  const groups = buildSpecGroups({ item: { ...item, pricing }, category: business?.category, attributes: business?.attributes });
  const hasDetails = countRows(groups) > 0;
  const description = item.description ?? "";
  const truncated = previewText(description).truncated;
  const headline = flashLive ? item.flash.sale.headline : null;
  const includes = item.includes ?? [];
  const hasAbout = Boolean(headline) || truncated || includes.length > 0;

  const today = business?.hours?.[todayKey()];
  const hoursValue = business
    ? `${today ? `${formatTime(today[0])} to ${formatTime(today[1])}` : t("item.closedToday")} · ${statusText(business)}`
    : seller.isOpen
      ? t("item.open")
      : t("item.closed");
  const additional = [
    flashLive && { label: t("item.add.saleStarts"), value: formatEat(item.flash.sale.startsAt) },
    flashLive && { label: t("item.add.saleEnds"), value: formatEat(item.flash.sale.endsAt) },
    quantityNote && { label: t("item.add.quantity"), value: quantityNote },
    item.terms && { label: t("item.terms"), value: item.terms },
    { label: t("item.add.hours"), value: hoursValue },
    (business ? [business.address, business.area, business.county].filter(Boolean).join(", ") : seller.townName) && {
      label: t("item.add.location"),
      value: business ? [business.address, business.area, business.county].filter(Boolean).join(", ") : seller.townName
    },
    { label: t("item.add.howToOrder"), value: t("item.howToOrderText") }
  ].filter(Boolean);

  const tabs = [
    { id: "item-overview", label: t("item.tab.overview") },
    hasDetails && { id: "item-details", label: t("item.tab.details") },
    hasAbout && { id: "item-about", label: t("item.tab.about") },
    moreState !== "empty" && { id: "item-more", label: t("item.tab.more") }
  ].filter(Boolean);

  const openFirst = mobile;

  return (
    <article className={styles.page} data-flash={flashLive ? "true" : "false"}>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>

      <Container className={styles.main}>
        <section className={`${styles.card} ${styles.buy}`} aria-labelledby="item-title">
          <div className={styles.media}>
            <ItemGallery images={item.images} name={item.name} />
          </div>

          <div className={styles.info}>
            <h1 id="item-title" className={styles.title}>
              {item.name}
            </h1>
            <StoreLine seller={seller} distance={distance} />
            {flashLive && <ItemFlashRow endsAt={flashEndsAt} />}
            <ItemPrice shown={shown} priceType={item.priceType} unit={pricing?.unit} />

            <div className={styles.availability}>
              <p className={styles.avail}>
                <span className={`${styles.dot} ${styles[item.availability]}`} aria-hidden="true" />
                {t(`item.availability.${item.availability}`)}
              </p>
              {stockNote && <p className={styles.stockNote}>{stockNote}</p>}
              {outOfStock && (
                <div className={styles.oos} role="status">
                  <p className={styles.oosTitle}>{t("item.outOfStockTitle")}</p>
                  <p>{t("item.outOfStockNote")}</p>
                </div>
              )}
            </div>

            {variants.length > 0 && <ItemVariants variants={variants} activeId={activeId} onChange={setChoice} showPrice={flashLive} />}
            {item.offers.length > 0 && <OfferStrip key={item.id} offers={item.offers} onSeeItems={onSeeItems} level={2} />}

            <ItemActions
              seller={seller}
              chatHref={chatHref}
              onChat={onChat("top")}
              onVisit={onVisit("top")}
              onCall={onCall}
              onShare={share}
              onReport={() => setReporting(true)}
            />
          </div>
        </section>

        <StoreStrip
          seller={seller}
          count={business?.services?.length ?? 0}
          distance={distance}
          chatHref={chatHref}
          onChat={onChat("card")}
          onVisit={onVisit("card")}
        />

        {desktop && <ItemTabs tabs={tabs} />}

        <Section id="item-overview" title={t("item.section.description")} mobile={mobile} defaultOpen={openFirst}>
          <Overview description={description} facts={facts} />
        </Section>

        {hasDetails && (
          <Section id="item-details" title={t(item.kind === "service" ? "item.section.detailsService" : "item.section.detailsProduct")} mobile={mobile}>
            <DetailsTable groups={groups} />
          </Section>
        )}

        {hasAbout && (
          <Section id="item-about" title={t("item.section.about")} mobile={mobile}>
            <About headline={headline} fullDescription={truncated ? description : ""} includes={includes} />
          </Section>
        )}

        <Section id="item-additional" title={t("item.section.additional")} mobile={mobile}>
          <Additional rows={additional} onReport={() => setReporting(true)} />
        </Section>

        <div ref={moreRef} className={nearMore ? undefined : styles.moreSpacer}>
          {nearMore && <ItemMore item={item} track={track} onState={setMoreState} />}
        </div>
      </Container>

      <ItemBottomBar
        slug={seller.slug}
        shown={shown}
        priceType={item.priceType}
        endsAt={flashLive ? flashEndsAt : null}
        chatHref={chatHref}
        onChat={onChat("bar")}
        onVisit={onVisit("bar")}
      />
      <ReportDialog business={seller} open={reporting} onClose={() => setReporting(false)} />
    </article>
  );
}

export default function ItemPage() {
  const { slug, itemId } = useParams();
  return <ItemView key={`${slug}/${itemId}`} slug={slug} itemId={itemId} />;
}
