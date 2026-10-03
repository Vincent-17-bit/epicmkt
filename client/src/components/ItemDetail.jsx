import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
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
import { items, logContactEvent } from "../api/index.js";
import { chatMessage, defaultVariantId } from "../lib/itemView.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import Skeleton from "./Skeleton.jsx";
import ItemGallery from "./ItemGallery.jsx";
import StoreSelective from "./StoreSelective.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import styles from "./ItemDetail.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const external = { target: "_blank", rel: "noopener noreferrer" };

export default function ItemDetail({ business, itemId, distanceKm, onClose, onSelect, onReport }) {
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [choice, setChoice] = useState({ itemId: null, variantId: null });

  const { data: detail, isError, error, refetch } = useQuery({
    queryKey: ["item", business.id, itemId],
    queryFn: () => items.getDetail(itemId, { businessId: business.id }),
    retry: false,
    staleTime: 30_000
  });

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
    if (detail?.id === itemId) titleRef.current?.focus({ preventScroll: true });
  }, [detail?.id, itemId]);

  useEffect(() => {
    if (!isError || error?.name !== "NotFoundError") return;
    showToast(t("item.unavailable"));
    closeRef.current();
  }, [isError, error]);

  const current = detail?.id === itemId ? detail : null;
  const variants = current?.pricing?.variants ?? [];
  const activeId = choice.itemId === itemId ? choice.variantId : defaultVariantId(current?.pricing);
  const variant = variants.find((v) => v.id === activeId) ?? null;
  const shown = variant ?? current?.pricing ?? null;
  const seller = current?.business ?? null;
  const message = current ? chatMessage({ item: current, variant, pricing: current.pricing }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;
  const track = (type) => () => logContactEvent({ businessId: business.id, type });

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

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <section
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-title"
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
          {isError && error?.name !== "NotFoundError" && (
            <div className={styles.state} role="alert">
              <p>{t("item.loadFailed")}</p>
              <button type="button" className={styles.retry} onClick={() => refetch()}>
                <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" />
                {t("item.retry")}
              </button>
            </div>
          )}

          {!current && !isError && (
            <div aria-busy="true">
              <Skeleton height="auto" radius="0" className={styles.skeletonMedia} />
              <div className={styles.info}>
                <Skeleton height="1.75rem" width="70%" />
                <Skeleton height="1.5rem" width="35%" />
                <Skeleton height="1rem" width="90%" />
              </div>
            </div>
          )}

          {current && (
            <>
              <ItemGallery key={current.id} images={current.images} name={current.name} />

              <div className={styles.info}>
                <div className={styles.badges}>
                  {shown && shown.savings > 0 && <span className={styles.saleChip}>{t("item.sale")} -{shown.discountPercent}%</span>}
                  {current.section && <span className={styles.tag}>{current.section}</span>}
                </div>
                <h2 id="item-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                  {current.name}
                </h2>

                {shown && (
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
                  <Link to={`/b/${seller.slug}`} className={styles.outline}>
                    <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
                    <span>{t("item.visitStore")}</span>
                  </Link>
                  <a href={chatHref} {...external} className={styles.outline} onClick={track("whatsapp")}>
                    <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
                    <span>{t("item.chatSeller")}</span>
                  </a>
                </div>

                <div className={styles.secondary}>
                  <a href={telLink(seller.phone)} className={styles.ghost} onClick={track("call")}>
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

              <StoreSelective
                businessId={business.id}
                businessSlug={business.slug}
                excludeItemId={current.id}
                onSelect={(next) => onSelect(next.id)}
              />

              <ItemSpecs key={current.id} item={current} category={business.category} attributes={business.attributes} />
            </>
          )}
        </div>

        {current && (
          <footer className={styles.footer}>
            <a href={chatHref} {...external} className={styles.chat} onClick={track("whatsapp")}>
              <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
              <span>{t("item.chatSeller")}</span>
            </a>
            <Link to={`/b/${seller.slug}`} className={styles.outline}>
              <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
              <span>{t("item.visitStore")}</span>
            </Link>
          </footer>
        )}
      </section>
    </div>
  );
}
