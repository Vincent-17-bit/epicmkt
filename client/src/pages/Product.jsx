import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBoxOpen,
  faCircleCheck,
  faCommentDots,
  faFlag,
  faPhone,
  faRotateRight,
  faShareNodes,
  faShieldHalved,
  faStore
} from "@fortawesome/free-solid-svg-icons";
import { formatDistance, formatKes, distanceKm as measure, telLink, whatsappLink } from "@epicmkt/shared";
import { getBusiness, items, logContactEvent, logEvent } from "../api/index.js";
import { chatMessage, defaultVariantId, offerTarget } from "../lib/itemView.js";
import { kesText } from "../lib/flash.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { useUrgency } from "../hooks/useCountdown.js";
import { useInView } from "../hooks/useInView.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useGeoStore } from "../stores/geo.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import Container from "../components/Container.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import Skeleton from "../components/Skeleton.jsx";
import ItemGallery from "../components/ItemGallery.jsx";
import MediaVideo from "../components/MediaVideo.jsx";
import FlashBanner from "../components/FlashBanner.jsx";
import FlashStickyBar from "../components/FlashStickyBar.jsx";
import OfferStrip from "../components/OfferStrip.jsx";
import StoreSelective from "../components/StoreSelective.jsx";
import ItemSpecs from "../components/ItemSpecs.jsx";
import ReportDialog from "../components/ReportDialog.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Product.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };
const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

export default function Product() {
  const { slug, itemId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const geo = useGeoStore();
  const titleRef = useRef(null);
  const viewed = useRef(null);
  const bannerRef = useRef(null);
  const lastLive = useRef(null);
  const [choice, setChoice] = useState({ itemId: null, variantId: null });
  const [hold, setHold] = useState(null);
  const [reporting, setReporting] = useState(false);

  const biz = useQuery({ queryKey: ["business", slug], queryFn: () => getBusiness(slug), retry: false });
  const business = biz.data ?? null;

  const { data: detail, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["item", business?.id, itemId],
    queryFn: () => items.getDetail(itemId, { businessId: business.id }),
    enabled: Boolean(business),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });

  const gone = isError && error?.name === "NotFoundError";
  const fresh = !gone && detail?.id === itemId ? detail : null;
  const failed = isError && !gone && !fresh;
  const vanished = gone && detail?.id === itemId;
  const current = hold && fresh && hold.id === fresh.id ? { ...fresh, flash: hold.flash, pricing: hold.pricing } : fresh;

  usePageTitle(current ? `${current.name} | ${business?.name ?? ""}`.replace(/ \| $/, "") : undefined);
  useItemJsonLd(fresh);

  const flashEndsAt = fresh?.flash?.sale.endsAt ?? null;
  const flashUrgency = useUrgency(flashEndsAt);
  const flashOver = Boolean(flashEndsAt) && flashUrgency === "ended";
  const bannerInView = useInView(bannerRef, null, current?.flash?.sale.id ?? null);

  useEffect(() => {
    if (!flashOver) return undefined;
    refetch();
    const id = window.setInterval(() => refetch(), 2000);
    return () => window.clearInterval(id);
  }, [flashOver, flashEndsAt]);

  useEffect(() => {
    setHold(null);
    lastLive.current = null;
  }, [itemId]);

  useEffect(() => {
    if (vanished && business) queryClient.invalidateQueries({ queryKey: ["business", business.slug] });
  }, [vanished]);

  useEffect(() => {
    if (gone) {
      setHold(null);
      lastLive.current = null;
      return;
    }
    if (!fresh) return;
    if (fresh.flash) {
      lastLive.current = { id: fresh.id, flash: fresh.flash, pricing: fresh.pricing };
      setHold(null);
      return;
    }
    const last = lastLive.current;
    if (last && last.id === fresh.id) {
      lastLive.current = null;
      setHold({ ...last, regularPrice: fresh.pricing?.regularPrice ?? null, leaving: false });
    }
  }, [fresh, gone]);

  useEffect(() => {
    if (!hold || hold.leaving) return undefined;
    const id = window.setTimeout(() => setHold((h) => (h ? { ...h, leaving: true } : h)), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [hold?.id, hold?.leaving]);

  useEffect(() => {
    if (!hold?.leaving) return undefined;
    const id = window.setTimeout(() => setHold(null), LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [hold?.leaving]);

  useEffect(() => {
    if (current || gone) titleRef.current?.focus({ preventScroll: true });
  }, [current?.id, gone, itemId]);

  useEffect(() => {
    if (!current || !business || viewed.current === current.id) return;
    viewed.current = current.id;
    logEvent("item_view", { businessId: business.id, itemId: current.id, kind: current.kind, flash: Boolean(current.flash) });
  }, [current?.id, business?.id]);

  useEffect(() => {
    if (!current) return undefined;
    const waits = current.offers.map((view) => view.remainingMs).filter((ms) => Number.isFinite(ms));
    if (!waits.length) return undefined;
    const wait = Math.min(...waits) + 300;
    if (wait > MAX_TIMEOUT) return undefined;
    const id = window.setTimeout(() => refetch(), wait);
    return () => window.clearTimeout(id);
  }, [dataUpdatedAt, current?.id]);

  if (biz.isError && biz.error?.name === "NotFoundError") return <NotFound />;

  if (biz.isError) {
    return (
      <Container className={styles.page}>
        <div className={styles.state} role="alert">
          <p>{t("item.loadFailed")}</p>
          <button type="button" className={styles.retry} onClick={() => biz.refetch()}>
            <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
            {t("item.retry")}
          </button>
        </div>
      </Container>
    );
  }

  const variants = current?.pricing?.variants ?? [];
  const activeId = choice.itemId === itemId ? choice.variantId : defaultVariantId(current?.pricing);
  const variant = variants.find((v) => v.id === activeId) ?? null;
  const shown = variant ?? current?.pricing ?? null;
  const seller = current?.business ?? null;
  const message = current ? chatMessage({ item: current, variant, pricing: current.pricing }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;
  const away = geo.coords && business ? measure(geo.coords, business) : null;
  const onFlash = Boolean(current?.flash);
  const storeHref = `/b/${slug}`;

  const track = (name, extra) => logEvent(name, { businessId: business.id, itemId, ...extra });
  const onChat = (placement) => () => {
    logContactEvent({ businessId: business.id, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: onFlash });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => logContactEvent({ businessId: business.id, type: "call" });
  const onSeeItems = (offer) => navigate(offerTarget(offer, business));

  const share = async () => {
    const url = `${window.location.origin}/b/${slug}/i/${encodeURIComponent(itemId)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: current?.name, text: `${current?.name} on EpicMKT`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(t("item.linkCopied"));
    } catch (err) {
      if (err?.name !== "AbortError") showToast(t("item.shareFailed"));
    }
  };

  const selective = business && (
    <StoreSelective
      businessId={business.id}
      businessSlug={business.slug}
      excludeItemId={itemId}
      onSelect={(next, index) => {
        track("store_selective_click", { targetItemId: next.id, position: index + 1 });
        navigate(`/b/${slug}/i/${encodeURIComponent(next.id)}`);
      }}
      onSeeAll={() => track("store_selective_click", { target: "see_all" })}
    />
  );

  const loading = !current && !gone && !failed;

  return (
    <article className={styles.root} data-flash={onFlash ? "true" : "false"} style={{ "--hue": business?.hue ?? 210 }}>
      <Container className={styles.crumbs}>
        <PageBreadcrumbs />
      </Container>

      {current && onFlash && !hold && shown && <FlashStickyBar endsAt={current.flash.sale.endsAt} price={shown.salePrice} visible={!bannerInView} />}

      <Container className={styles.page}>
        {failed && (
          <div className={styles.state} role="alert">
            <p>{t("item.loadFailed")}</p>
            <button type="button" className={styles.retry} onClick={() => refetch()}>
              <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
              {t("item.retry")}
            </button>
          </div>
        )}

        {gone && (
          <div className={styles.state}>
            <FontAwesomeIcon icon={faBoxOpen} className={styles.goneIcon} aria-hidden="true" />
            <h1 id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
              {t("item.gone")}
            </h1>
            <p className={styles.description}>{t("item.goneHint")}</p>
            <Link to={storeHref} className={`${styles.outline} ${styles.single}`} onClick={onVisit("gone")}>
              <FontAwesomeIcon icon={faStore} aria-hidden="true" />
              <span>{t("item.visitStore")}</span>
            </Link>
          </div>
        )}

        {loading && (
          <div className={styles.layout} aria-busy="true">
            <div className={styles.media}>
              <Skeleton height="auto" radius="var(--radius-card)" className={styles.skeletonMedia} />
              <div className={styles.skeletonThumbs}>
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} width="64px" height="64px" radius="var(--radius-sm)" />
                ))}
              </div>
            </div>
            <div className={styles.buy}>
              <Skeleton height="2rem" width="75%" />
              <Skeleton height="2.25rem" width="40%" />
              <Skeleton height="1rem" width="90%" />
              <Skeleton height="1rem" width="65%" />
              <Skeleton height="56px" radius="var(--radius-card)" />
            </div>
          </div>
        )}

        {current && seller && (
          <div className={styles.layout}>
            <div className={styles.media}>
              <ItemGallery key={`gallery-${current.id}`} images={current.images} name={current.name} />
              {current.videos?.length > 0 && (
                <section className={styles.videos} aria-label={t("video.heading")}>
                  {current.videos.map((video) => (
                    <MediaVideo key={`${current.id}-${video.id}`} src={video.url} label={current.name} />
                  ))}
                </section>
              )}
            </div>

            <div className={styles.buy}>
              {current.flash && (
                <div className={styles.collapse} data-open={hold?.leaving ? "false" : "true"}>
                  <div className={styles.collapseInner}>
                    <div className={styles.flashCard}>
                      <FlashBanner key={current.flash.sale.id} flash={current.flash} pricing={shown} unit={current.pricing?.unit} bannerRef={bannerRef} ended={Boolean(hold)} />
                    </div>
                    {hold && (
                      <p className={styles.endedNotice} role="status">
                        {t("flash.endedNotice")}
                        {hold.regularPrice !== null && ` ${kesText(hold.regularPrice)}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <header className={styles.head}>
                <div className={styles.badges}>
                  {onFlash && (
                    <span className={styles.flashChip}>
                      <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
                      {t("item.flash")}
                    </span>
                  )}
                  {shown && shown.savings > 0 && (
                    <span className={styles.saleChip}>
                      {t("item.sale")} -{shown.discountPercent}%
                    </span>
                  )}
                  {current.section && <span className={styles.tag}>{current.section}</span>}
                </div>
                <h1 id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {current.name}
                </h1>
                <p className={styles.availability}>
                  <span className={`${styles.dot} ${styles[current.availability]}`} aria-hidden="true" />
                  {t(`item.availability.${current.availability}`)}
                </p>
              </header>

              {shown && !onFlash && (
                <div className={styles.priceBlock}>
                  {shown.savings > 0 ? (
                    <>
                      <p className={styles.salePrice}>
                        {formatKes(shown.salePrice)}
                        {current.pricing.unit && <span className={styles.unit}> / {current.pricing.unit}</span>}
                      </p>
                      <p className={styles.was}>
                        <s>
                          <span className={styles.sr}>{t("item.was")} </span>
                          {formatKes(shown.regularPrice)}
                        </s>
                        <span className={styles.saved}>
                          {t("item.save")} {formatKes(shown.savings)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className={styles.price}>
                      {formatKes(shown.regularPrice)}
                      {current.pricing.unit && <span className={styles.unit}> / {current.pricing.unit}</span>}
                    </p>
                  )}
                </div>
              )}

              <OfferStrip key={current.id} offers={current.offers} onSeeItems={onSeeItems} />

              {variants.length > 0 && (
                <div role="radiogroup" aria-label={t("item.options")} className={styles.variants}>
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={v.id === activeId}
                      className={`${styles.variant} ${v.id === activeId ? styles.selected : ""}`}
                      onClick={() => setChoice({ itemId, variantId: v.id })}
                    >
                      {v.label}
                      {onFlash && <span className={styles.variantPrice}>{kesText(v.salePrice)}</span>}
                    </button>
                  ))}
                </div>
              )}

              {current.shortDescription && <p className={styles.description}>{current.shortDescription}</p>}

              <div className={styles.cta}>
                <a href={chatHref} {...external} className={styles.chat} onClick={onChat("buy")}>
                  <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
                  <span>{t("item.chatSeller")}</span>
                </a>
                <a href={telLink(seller.phone)} className={styles.outline} onClick={onCall}>
                  <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                  <span>{t("item.call")}</span>
                </a>
              </div>

              <section className={styles.sold} aria-label={t("item.soldBy")}>
                <Link to={storeHref} className={styles.seller} onClick={onVisit("card")}>
                  <span className={styles.logo}>
                    {seller.logo ? <img src={seller.logo} alt="" className={styles.logoImg} decoding="async" /> : seller.name.slice(0, 1)}
                  </span>
                  <span className={styles.sellerText}>
                    <span className={styles.soldBy}>{t("item.soldBy")}</span>
                    <span className={styles.sellerName}>
                      <span>{seller.name}</span>
                      {seller.verified && (
                        <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("item.verified")} aria-label={t("item.verified")} />
                      )}
                    </span>
                    <span className={styles.sellerMeta}>
                      {seller.townName}
                      {Number.isFinite(away) && ` · ${formatDistance(away)}`}
                    </span>
                  </span>
                  <span className={seller.isOpen ? styles.open : styles.closed}>{seller.isOpen ? t("item.open") : t("item.closed")}</span>
                </Link>
                <div className={styles.secondary}>
                  <Link to={storeHref} className={styles.ghost} onClick={onVisit("secondary")}>
                    <FontAwesomeIcon icon={faStore} aria-hidden="true" />
                    <span>{t("item.visitStore")}</span>
                  </Link>
                  <button type="button" className={styles.ghost} onClick={share}>
                    <FontAwesomeIcon icon={faShareNodes} aria-hidden="true" />
                    <span>{t("item.share")}</span>
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setReporting(true)}>
                    <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
                    <span>{t("item.reportPrice")}</span>
                  </button>
                </div>
                <p className={styles.note}>
                  <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
                  <span>{t("item.disclaimer")}</span>
                </p>
              </section>
            </div>

            <div className={styles.more}>
              <ItemSpecs
                key={`specs-${current.id}`}
                item={current}
                category={business.category}
                attributes={business.attributes}
                onExpand={(panel) => track("spec_expand", { panel })}
              />
            </div>
          </div>
        )}
      </Container>

      {(current || gone || loading) && <div className={styles.related}>{selective}</div>}

      {current && seller && (
        <div className={styles.bar}>
          <a href={chatHref} {...external} className={styles.chat} onClick={onChat("footer")}>
            <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
            <span>{t("item.chatSeller")}</span>
          </a>
          <Link to={storeHref} className={styles.outline} onClick={onVisit("footer")}>
            <FontAwesomeIcon icon={faStore} aria-hidden="true" />
            <span>{t("item.visitStore")}</span>
          </Link>
        </div>
      )}

      {business && <ReportDialog business={business} open={reporting} onClose={() => setReporting(false)} />}
    </article>
  );
}
