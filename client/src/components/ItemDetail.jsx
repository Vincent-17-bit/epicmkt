import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { formatDistance, formatKes, telLink, whatsappLink } from "@epicmkt/shared";
import { items, logContactEvent, logEvent } from "../api/index.js";
import { chatMessage, defaultVariantId } from "../lib/itemView.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import Skeleton from "./Skeleton.jsx";
import ItemGallery from "./ItemGallery.jsx";
import FlashBanner from "./FlashBanner.jsx";
import FlashStickyBar from "./FlashStickyBar.jsx";
import { useUrgency } from "../hooks/useCountdown.js";
import { kesText } from "../lib/flash.js";
import { useInView } from "../hooks/useInView.js";
import OfferStrip from "./OfferStrip.jsx";
import StoreSelective from "./StoreSelective.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import styles from "./ItemDetail.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const external = { target: "_blank", rel: "noopener noreferrer" };
const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

export default function ItemDetail({ business, itemId, distanceKm, onClose, onSelect, onReport }) {
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);
  const viewed = useRef(null);
  const bannerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [choice, setChoice] = useState({ itemId: null, variantId: null });

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
  const [hold, setHold] = useState(null);
  const lastLive = useRef(null);
  const current = hold && fresh && hold.id === fresh.id ? { ...fresh, flash: hold.flash, pricing: hold.pricing } : fresh;

  useItemJsonLd(fresh);

  const flashEndsAt = fresh?.flash?.sale.endsAt ?? null;
  const flashUrgency = useUrgency(flashEndsAt);
  const flashOver = Boolean(flashEndsAt) && flashUrgency === "ended";
  const bannerInView = useInView(bannerRef, bodyRef, current?.flash?.sale.id ?? null);

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
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
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
  const message = current ? chatMessage({ item: current, variant, pricing: current.pricing }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;

  const track = (name, extra) => logEvent(name, { businessId: business.id, itemId, ...extra });
  const onChat = (placement) => () => {
    logContactEvent({ businessId: business.id, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: Boolean(current?.flash) });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => logContactEvent({ businessId: business.id, type: "call" });

  const share = async () => {
    const url = `${window.location.origin}/b/${business.slug}?item=${encodeURIComponent(itemId)}`;
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
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <section
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
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
                  {current?.name ?? ""}
                </span>
              </li>
            </ol>
          </nav>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("item.close")}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
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
                <h2 id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {t("item.gone")}
                </h2>
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
              <ItemGallery key={`gallery-${current.id}`} images={current.images} name={current.name} />

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
                </div>
                <h2 id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {current.name}
                </h2>

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

                <OfferStrip key={current.id} offers={current.offers} />

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

                <p className={styles.availability}>
                  <span className={`${styles.dot} ${styles[current.availability]}`} aria-hidden="true" />
                  {t(`item.availability.${current.availability}`)}
                </p>

                {current.shortDescription && <p className={styles.description}>{current.shortDescription}</p>}
              </div>

              <section className={styles.sold} aria-label={t("item.soldBy")}>
                <div className={styles.seller}>
                  <span className={styles.logo}>
                    {seller.logo ? <img src={seller.logo} alt="" className={styles.logoImg} decoding="async" /> : seller.name.slice(0, 1)}
                  </span>
                  <div className={styles.sellerText}>
                    <p className={styles.soldBy}>{t("item.soldBy")}</p>
                    <p className={styles.sellerName}>
                      <span>{seller.name}</span>
                      {seller.verified && (
                        <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("item.verified")} aria-label={t("item.verified")} />
                      )}
                    </p>
                    <p className={styles.sellerMeta}>
                      {seller.townName}
                      {Number.isFinite(distanceKm) && ` · ${formatDistance(distanceKm)}`}
                    </p>
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

              {selective}

              <ItemSpecs
                key={`specs-${current.id}`}
                item={current}
                category={business.category}
                attributes={business.attributes}
                onExpand={(panel) => track("spec_expand", { panel })}
              />
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
