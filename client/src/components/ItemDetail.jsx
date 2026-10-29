import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCommentDots,
  faFlag,
  faPhone,
  faRotateRight,
  faShareNodes,
  faStore,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { formatDistance, formatKes, offerLabel, telLink, whatsappLink } from "@epicmkt/shared";
import { items, logContactEvent, logEvent } from "../api/index.js";
import { buildSpecGroups, chatMessage, defaultVariantId, HIGHLIGHT_LIMIT, normalizeHighlights } from "../lib/itemView.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import Skeleton from "./Skeleton.jsx";
import ItemGallery from "./ItemGallery.jsx";
import MediaVideo from "./MediaVideo.jsx";
import { OfferChip, StockTag } from "@epicmkt/ui";

const stockLabels = () => ({ lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft") });
import FlashBanner from "./FlashBanner.jsx";
import FlashStickyBar from "./FlashStickyBar.jsx";
import { useUrgency } from "../hooks/useCountdown.js";
import { kesText } from "../lib/flash.js";
import { useInView } from "../hooks/useInView.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { usePageMeta } from "../hooks/usePageMeta.js";
import OfferStrip from "./OfferStrip.jsx";
import SimilarItems from "./SimilarItems.jsx";
import StoreSelective from "./StoreSelective.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import styles from "./ItemDetail.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const external = { target: "_blank", rel: "noopener noreferrer" };
const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

function Highlights({ items, onMore }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, HIGHLIGHT_LIMIT);
  return (
    <section className={styles.about} aria-labelledby="item-about">
      <h3 id="item-about" className={styles.aboutTitle}>
        {t("item.highlights")}
      </h3>
      <ul className={styles.bullets}>
        {shown.map((entry, index) => (
          <li key={index} className={styles.bullet}>
            {entry.title && <strong className={styles.lead}>{entry.title} </strong>}
            {entry.text}
          </li>
        ))}
      </ul>
      <div className={styles.aboutActions}>
        {items.length > HIGHLIGHT_LIMIT && (
          <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("item.showLess") : t("item.showAll")}
          </button>
        )}
        {onMore && (
          <button type="button" className={styles.moreLink} onClick={onMore}>
            {t("item.moreDetails")}
          </button>
        )}
      </div>
    </section>
  );
}

// `layout="sheet"` is the dialog laid over a store's page. `layout="page"` is the same content as a page of its own
// (no scrim, no focus trap, no scroll lock): the item's address is /b/<store>/i/<item>.
export default function ItemDetail({ business, itemId, distanceKm, onClose, onSelect, onReport, layout = "sheet" }) {
  const isPage = layout === "page";
  const Heading = isPage ? "h1" : "h2";
  const queryClient = useQueryClient();
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);
  const viewed = useRef(null);
  const bannerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [choice, setChoice] = useState({ itemId: null, variantId: null });
  const [specsPing, setSpecsPing] = useState(0);

  const { data: detail, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["item", business.id, itemId],
    queryFn: () => items.getDetail(itemId, { businessId: business.id }),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });

  const gone = isError && error?.name === "NotFoundError";
  const fresh = !gone && detail?.id === itemId ? detail : null;
  const failed = isError && !gone && !fresh;
  const vanished = gone && detail?.id === itemId;
  const [hold, setHold] = useState(null);
  const lastLive = useRef(null);
  const current = hold && fresh && hold.id === fresh.id ? { ...fresh, flash: hold.flash, pricing: hold.pricing } : fresh;

  useItemJsonLd(fresh);

  const flashEndsAt = fresh?.flash?.sale.endsAt ?? null;
  const flashUrgency = useUrgency(flashEndsAt);
  const flashOver = Boolean(flashEndsAt) && flashUrgency === "ended";
  const bannerInView = useInView(bannerRef, isPage ? undefined : bodyRef, current?.flash?.sale.id ?? null);

  usePageTitle(isPage && fresh ? `${fresh.name} | ${business.name}` : undefined);
  usePageMeta(
    isPage && fresh
      ? { description: fresh.description, image: fresh.images?.[0]?.url ?? business.coverUrl ?? business.logoUrl, path: `/b/${business.slug}/i/${encodeURIComponent(fresh.id)}` }
      : undefined
  );

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
    if (vanished) queryClient.invalidateQueries({ queryKey: ["business", business.slug] });
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
    if (isPage) return undefined;
    const opener = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || document.querySelector("dialog[open]")) return;
      const nodes = [...sheetRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length > 0);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const inside = sheetRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!isPage && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [itemId]);

  useEffect(() => {
    if (current || gone) titleRef.current?.focus({ preventScroll: true });
  }, [current?.id, gone, itemId]);

  useEffect(() => {
    if (!current || viewed.current === current.id) return;
    viewed.current = current.id;
    logEvent("item_view", { businessId: business.id, itemId: current.id, kind: current.kind, flash: Boolean(current.flash) });
  }, [current?.id]);

  useEffect(() => {
    if (!current) return undefined;
    const waits = current.offers.map((view) => view.remainingMs).filter((ms) => Number.isFinite(ms));
    if (!waits.length) return undefined;
    const wait = Math.min(...waits) + 300;
    if (wait > MAX_TIMEOUT) return undefined;
    const id = window.setTimeout(() => refetch(), wait);
    return () => window.clearTimeout(id);
  }, [dataUpdatedAt, current?.id]);

  const variants = current?.pricing?.variants ?? [];
  const activeId = choice.itemId === itemId ? choice.variantId : defaultVariantId(current?.pricing);
  const variant = variants.find((v) => v.id === activeId) ?? null;
  const shown = variant ?? current?.pricing ?? null;
  const seller = current?.business ?? null;
  const sellerCount = seller ? (seller.productCount ?? (seller.slug === business.slug ? business.productCount : null)) : null;
  const message = current ? chatMessage({ item: current, variant, pricing: current.pricing }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;
  const highlights = normalizeHighlights(current?.highlights);
  const hasSpecs = current ? buildSpecGroups({ item: current, category: business.category, attributes: business.attributes }).length > 0 : false;

  const track = (name, extra) => logEvent(name, { businessId: business.id, itemId, ...extra });
  const onChat = (placement) => () => {
    logContactEvent({ businessId: business.id, itemId, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: Boolean(current?.flash) });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => logContactEvent({ businessId: business.id, itemId, type: "call" });

  const share = async () => {
    const path = isPage ? `/b/${business.slug}/i/${encodeURIComponent(itemId)}` : `/b/${business.slug}?item=${encodeURIComponent(itemId)}`;
    const url = `${window.location.origin}${path}`;
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

  const selective = (
    <StoreSelective
      businessId={business.id}
      businessSlug={business.slug}
      excludeItemId={itemId}
      onSelect={(next, index) => {
        track("store_selective_click", { targetItemId: next.id, position: index + 1 });
        onSelect(next.id);
      }}
      onSeeAll={() => track("store_selective_click", { target: "see_all" })}
    />
  );

  return (
    <div className={styles.root} data-variant={layout}>
      {!isPage && <div className={styles.scrim} onClick={onClose} aria-hidden="true" />}
      <section
        ref={sheetRef}
        className={styles.sheet}
        {...(isPage ? {} : { role: "dialog", "aria-modal": "true" })}
        aria-labelledby={current || gone ? "item-title" : undefined}
        aria-label={current || gone ? undefined : business.name}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <nav aria-label={t("item.back")} className={styles.trail}>
            <ol className={styles.list}>
              <li className={styles.crumb}>
                <button type="button" className={styles.parent} onClick={onClose}>
                  <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                  <span className={styles.parentName}>{business.name}</span>
                </button>
              </li>
              <li className={styles.crumb}>
                <FontAwesomeIcon icon={faChevronRight} className={styles.sep} aria-hidden="true" />
                <span className={styles.current} aria-current="page">
                  {current ? current.name : vanished ? t("breadcrumbs.itemUnavailable") : ""}
                </span>
              </li>
            </ol>
          </nav>
          {!isPage && (
            <button type="button" className={styles.close} onClick={onClose} aria-label={t("item.close")}>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </header>

        <div ref={bodyRef} className={styles.body}>
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
            <>
              <div className={styles.state}>
                <FontAwesomeIcon icon={faBoxOpen} className={styles.goneIcon} aria-hidden="true" />
                <Heading id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {t("item.gone")}
                </Heading>
                <p className={styles.description}>{t("item.goneHint")}</p>
                <Link to={`/b/${business.slug}`} className={`${styles.outline} ${styles.single}`} onClick={onVisit("gone")}>
                  <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
                  <span>{t("item.visitStore")}</span>
                </Link>
              </div>
              {selective}
            </>
          )}

          {!current && !gone && !failed && (
            <div aria-busy="true">
              <Skeleton height="auto" radius="0" className={styles.skeletonMedia} />
              <div className={styles.skeletonThumbs}>
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} width="56px" height="56px" radius="var(--radius-sm)" />
                ))}
              </div>
              <div className={styles.info}>
                <Skeleton height="1.75rem" width="70%" />
                <Skeleton height="1.5rem" width="35%" />
                <Skeleton height="1rem" width="90%" />
                <Skeleton height="1rem" width="60%" />
              </div>
              <div className={styles.skeletonSpecs}>
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} height="52px" radius="var(--radius-sm)" />
                ))}
              </div>
              {selective}
            </div>
          )}

          {current && (
            <>
              {current.flash && !hold && shown && <FlashStickyBar endsAt={current.flash.sale.endsAt} price={shown.salePrice} visible={!bannerInView} />}
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
              <div className={styles.content}>
              <div className={styles.details}>

              {current.flash && (
                <div className={styles.collapse} data-open={hold?.leaving ? "false" : "true"}>
                  <div className={styles.collapseInner}>
                    <FlashBanner key={current.flash.sale.id} flash={current.flash} pricing={shown} unit={current.pricing?.unit} bannerRef={bannerRef} ended={Boolean(hold)} />
                    {hold && (
                      <p className={styles.endedNotice} role="status">
                        {t("flash.endedNotice")}
                        {hold.regularPrice !== null && ` ${kesText(hold.regularPrice)}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.info}>
                <div className={styles.badges}>
                  {shown && shown.savings > 0 && <span className={styles.saleChip}>{t("item.sale")} -{shown.discountPercent}%</span>}
                  {current.section && <span className={styles.tag}>{current.section}</span>}
                  {current.offers.length > 0 && (
                    <OfferChip
                      offer={{ label: offerLabel(current.offers[0].offer), extra: current.offers.length - 1 }}
                      className={styles.offerBadge}
                      labels={{ offer: t("offer.chip"), more: t("offer.more") }}
                    />
                  )}
                </div>
                <Heading id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {current.name}
                </Heading>
                {current.brand && <p className={styles.brand}>{current.brand}</p>}

                {shown && !current.flash && (
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
                          <span>
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

                <OfferStrip key={current.id} offers={current.offers} item={current} price={shown?.salePrice ?? null} onOpenProduct={onSelect} />

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
                        {current.flash && <span className={styles.variantPrice}>{kesText(v.salePrice)}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Available says nothing. Running low gets the amber tag; by appointment is worth knowing before a visit. */}
                {current.availability === "limited_stock" && <StockTag item={current} labels={stockLabels()} className={styles.stockTag} />}
                {current.availability === "by_appointment" && <p className={styles.availability}>{t("item.availability.by_appointment")}</p>}

                {current.shortDescription && <p className={styles.description}>{current.shortDescription}</p>}
              </div>

              <SimilarItems key={`similar-${current.id}`} itemId={current.id} businessId={business.id} />

              <section className={styles.sold} aria-label={t("item.soldBy")}>
                <div className={styles.seller}>
                  <span className={styles.logo}>
                    {seller.logo ? <img src={seller.logo} alt="" className={styles.logoImg} decoding="async" /> : seller.name.slice(0, 1)}
                  </span>
                  <div className={styles.sellerText}>
                    <p className={styles.soldBy}>{t("item.soldBy")}</p>
                    <p className={sellerCount > 0 ? `${styles.sellerName} ${styles.sellerNameCounted}` : styles.sellerName}>
                      <span>{seller.name}</span>
                      {seller.verified && (
                        <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("item.verified")} aria-label={t("item.verified")} />
                      )}
                      {Number.isInteger(sellerCount) && sellerCount > 0 && (
                        <span className={styles.sellerCount}>{sellerCount === 1 ? "1 product" : `${sellerCount} products`}</span>
                      )}
                    </p>
                    <p className={styles.sellerMeta}>
                      {seller.townName}
                      {Number.isFinite(distanceKm) && ` · ${formatDistance(distanceKm)}`}
                    </p>
                    {!seller.isOpen && seller.statusLine && <p className={styles.sellerMeta}>{seller.statusLine}</p>}
                  </div>
                  <span className={seller.isOpen ? styles.open : styles.closed}>{seller.isOpen ? t("item.open") : t("item.closed")}</span>
                </div>

                <div className={styles.actions}>
                  <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit("card")}>
                    <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
                    <span>{t("item.visitStore")}</span>
                  </Link>
                  <a href={chatHref} {...external} className={styles.outline} onClick={onChat("card")}>
                    <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
                    <span>{t("item.chatSeller")}</span>
                  </a>
                </div>

                <div className={styles.secondary}>
                  <a href={telLink(seller.phone)} className={styles.ghost} onClick={onCall}>
                    <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                    <span>{t("item.call")}</span>
                  </a>
                  <button type="button" className={styles.ghost} onClick={share}>
                    <FontAwesomeIcon icon={faShareNodes} aria-hidden="true" />
                    <span>{t("item.share")}</span>
                  </button>
                  <button type="button" className={styles.ghost} onClick={onReport}>
                    <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
                    <span>{t("item.reportPrice")}</span>
                  </button>
                </div>

                <p className={styles.note}>{t("item.disclaimer")}</p>
              </section>

              {highlights.length > 0 && (
                <Highlights key={`highlights-${current.id}`} items={highlights} onMore={hasSpecs ? () => setSpecsPing((n) => n + 1) : undefined} />
              )}

              {selective}
              </div>

              <div className={styles.panels}>
                <ItemSpecs
                  key={`specs-${current.id}`}
                  item={current}
                  category={business.category}
                  attributes={business.attributes}
                  reveal={specsPing}
                  onExpand={(panel) => track("spec_expand", { panel })}
                />
              </div>
              </div>
              </div>
            </>
          )}
        </div>

        {current && (
          <footer className={styles.footer}>
            <a href={chatHref} {...external} className={styles.chat} onClick={onChat("footer")}>
              <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
              <span>{t("item.chatSeller")}</span>
            </a>
            <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit("footer")}>
              <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
              <span>{t("item.visitStore")}</span>
            </Link>
          </footer>
        )}
      </section>
    </div>
  );
}
