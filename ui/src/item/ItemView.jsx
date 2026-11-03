import { useState } from "react";
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
import { buildSpecGroups, chatMessage, defaultVariantId, formatDistance, formatKes, HIGHLIGHT_LIMIT, normalizeHighlights, offerLabel, telLink, whatsappLink } from "@epicmkt/shared";
import { dedupeDescription } from "../lib/media.js";
import { actionProps, isPreview } from "../preview.js";
import OfferChip from "../components/OfferChip.jsx";
import Skeleton from "../components/Skeleton.jsx";
import StockTag from "../components/StockTag.jsx";
import ItemDescription from "./ItemDescription.jsx";
import ItemGallery from "./ItemGallery.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import { ItemLabelsProvider, useItemT } from "./labels.js";
import styles from "./ItemView.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

function DefaultLink({ to, ...rest }) {
  return <a href={to} {...rest} />;
}

function Go({ Nav, preview, to, onClick, ...rest }) {
  if (preview) return <a aria-disabled="true" tabIndex={-1} {...rest} />;
  return <Nav to={to} onClick={onClick} {...rest} />;
}

function Highlights({ items, onMore, dataHl }) {
  const t = useItemT();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, HIGHLIGHT_LIMIT);
  return (
    <section className={styles.about} aria-labelledby="item-about" data-hl={dataHl}>
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

function Inner({
  layout,
  preview,
  state,
  item,
  itemId,
  business,
  distanceKm,
  vanished,
  flash,
  offers,
  similar,
  selective,
  marks,
  Nav,
  sheetRef,
  bodyRef,
  titleRef,
  onClose,
  onRetry,
  onChat,
  onVisit,
  onCall,
  onShare,
  onReport,
  onExpandSpec
}) {
  const t = useItemT();
  const isPage = layout === "page";
  const Heading = isPage ? "h1" : "h2";
  const disabled = actionProps(preview);
  const [choice, setChoice] = useState({ itemId: null, variantId: null });
  const [specsPing, setSpecsPing] = useState(0);
  const ready = state === "ready" && item;
  const gone = state === "gone";
  const failed = state === "failed";

  const variants = item?.pricing?.variants ?? [];
  const activeId = choice.itemId === itemId ? choice.variantId : defaultVariantId(item?.pricing);
  const variant = variants.find((v) => v.id === activeId) ?? null;
  const shown = variant ?? item?.pricing ?? null;
  const seller = item?.business ?? null;
  const sellerCount = seller ? (seller.productCount ?? (seller.slug === business.slug ? business.productCount : null)) : null;
  const message = item ? chatMessage({ item, variant, pricing: item.pricing, greeting: business.shopSettings?.whatsappGreeting }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;
  const highlights = normalizeHighlights(item?.highlights);
  const fullDescription = item ? dedupeDescription(item.shortDescription, item.description) : "";
  const hasSpecs = item ? buildSpecGroups({ item, category: business.category, attributes: business.attributes }).length > 0 : false;
  const mark = (part) => marks?.(part);
  const stock = { lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft") };
  const chat = (placement) => () => onChat?.(placement, variant);
  const visit = (placement) => () => onVisit?.(placement);

  return (
    <div className={styles.root} data-variant={layout}>
      {!isPage && <div className={styles.scrim} onClick={onClose} aria-hidden="true" />}
      <section
        ref={sheetRef}
        className={styles.sheet}
        {...(isPage ? {} : { role: "dialog", "aria-modal": "true" })}
        aria-labelledby={ready || gone ? "item-title" : undefined}
        aria-label={ready || gone ? undefined : business.name}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <nav aria-label={t("item.back")} className={styles.trail}>
            <ol className={styles.list}>
              <li className={styles.crumb}>
                <button type="button" className={styles.parent} {...disabled.button(onClose)}>
                  <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                  <span className={styles.parentName}>{business.name}</span>
                </button>
              </li>
              <li className={styles.crumb}>
                <FontAwesomeIcon icon={faChevronRight} className={styles.sep} aria-hidden="true" />
                <span className={styles.current} aria-current="page">
                  {ready ? item.name : vanished ? t("breadcrumbs.itemUnavailable") : ""}
                </span>
              </li>
            </ol>
          </nav>
          {!isPage && (
            <button type="button" className={styles.close} {...disabled.button(onClose)} aria-label={t("item.close")}>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </header>

        <div ref={bodyRef} className={styles.body}>
          {failed && (
            <div className={styles.state} role="alert">
              <p>{t("item.loadFailed")}</p>
              <button type="button" className={styles.retry} {...disabled.button(onRetry)}>
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
                <Go Nav={Nav} preview={preview} to={`/b/${business.slug}`} onClick={visit("gone")} className={`${styles.outline} ${styles.single}`}>
                  <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
                  <span>{t("item.visitStore")}</span>
                </Go>
              </div>
              {selective}
            </>
          )}

          {!ready && !gone && !failed && (
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

          {ready && (
            <>
              {flash?.sticky && shown && flash.sticky(shown)}
              <div className={styles.layout}>
                <div className={styles.media} data-hl={mark("media")}>
                  <ItemGallery key={`gallery-${item.id}`} item={item} />
                </div>
                <div className={styles.content}>
                  <div className={styles.details}>
                    {item.flash && flash?.banner && (
                      <div className={styles.collapse} data-open={flash.leaving ? "false" : "true"}>
                        <div className={styles.collapseInner}>
                          {flash.banner(shown)}
                          {flash.endedText && (
                            <p className={styles.endedNotice} role="status">
                              {flash.endedText}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={styles.info}>
                      {item.brand && <p className={styles.brand} data-hl={mark("brand")}>{item.brand}</p>}
                      <Heading id="item-title" ref={titleRef} tabIndex={-1} className={styles.title} data-hl={mark("name")}>
                        {item.name}
                      </Heading>
                      {item.shortDescription && <p className={styles.description} data-hl={mark("short")}>{item.shortDescription}</p>}

                      {shown && !item.flash && (
                        <div className={styles.priceBlock} data-hl={mark("price")}>
                          {shown.savings > 0 ? (
                            <>
                              <p className={styles.salePrice}>
                                {formatKes(shown.salePrice)}
                                {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
                                <span className={styles.saleChip}>{t("item.sale")} -{shown.discountPercent}%</span>
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
                              {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
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
                              {item.flash && <span className={styles.variantPrice}>{flash?.priceText ? flash.priceText(v.salePrice) : formatKes(v.salePrice)}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {item.availability === "limited_stock" && <StockTag item={item} labels={stock} className={styles.stockTag} />}
                      {item.availability === "by_appointment" && <p className={styles.availability}>{t("item.availability.by_appointment")}</p>}
                      {item.packSize && (
                        <p className={styles.packSize}>
                          <span className={styles.packLabel}>{t("item.packSize")}:</span> {item.packSize}
                        </p>
                      )}

                      {offers && offers(shown)}

                      {(item.section || item.offers.length > 0) && (
                        <div className={styles.badges}>
                          {item.section && <span className={styles.tag}>{item.section}</span>}
                          {item.offers.length > 0 && (
                            <OfferChip
                              offer={{ label: offerLabel(item.offers[0].offer), extra: item.offers.length - 1 }}
                              className={styles.offerBadge}
                              labels={{ offer: t("offer.chip"), more: t("offer.more") }}
                            />
                          )}
                        </div>
                      )}
                    </div>

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
                        <Go Nav={Nav} preview={preview} to={`/b/${seller.slug}`} onClick={visit("card")} className={styles.outline}>
                          <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
                          <span>{t("item.visitStore")}</span>
                        </Go>
                        <a {...disabled.link(chatHref, chat("card"), external)} className={styles.outline}>
                          <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
                          <span>{t("item.chatSeller")}</span>
                        </a>
                      </div>

                      <div className={styles.secondary}>
                        <a {...disabled.link(telLink(seller.phone), onCall)} className={styles.ghost}>
                          <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                          <span>{t("item.call")}</span>
                        </a>
                        <button type="button" className={styles.ghost} {...disabled.button(onShare)}>
                          <FontAwesomeIcon icon={faShareNodes} aria-hidden="true" />
                          <span>{t("item.share")}</span>
                        </button>
                        <button type="button" className={styles.ghost} {...disabled.button(onReport)}>
                          <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
                          <span>{t("item.reportPrice")}</span>
                        </button>
                      </div>

                      <p className={styles.note}>{t("item.disclaimer")}</p>
                    </section>

                    {highlights.length > 0 && (
                      <Highlights key={`highlights-${item.id}`} dataHl={mark("highlights")} items={highlights} onMore={hasSpecs ? () => setSpecsPing((n) => n + 1) : undefined} />
                    )}

                    {fullDescription && <ItemDescription key={`description-${item.id}`} text={fullDescription} dataHl={mark("description")} />}

                    {selective}
                  </div>

                  <div className={styles.panels} data-hl={mark("specs")}>
                    <ItemSpecs
                      key={`specs-${item.id}`}
                      item={item}
                      category={business.category}
                      attributes={business.attributes}
                      reveal={specsPing}
                      onExpand={onExpandSpec}
                    />
                  </div>
                </div>
              </div>
              {similar && similar(styles.similar)}
            </>
          )}
        </div>

        {ready && (
          <footer className={styles.footer}>
            <a {...disabled.link(chatHref, chat("footer"), external)} className={styles.chat}>
              <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
              <span>{t("item.chatSeller")}</span>
            </a>
            <Go Nav={Nav} preview={preview} to={`/b/${seller.slug}`} onClick={visit("footer")} className={styles.outline}>
              <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
              <span>{t("item.visitStore")}</span>
            </Go>
          </footer>
        )}
      </section>
    </div>
  );
}

export default function ItemView({ mode = "live", labels, Link = null, ...props }) {
  return (
    <ItemLabelsProvider labels={labels}>
      <Inner preview={isPreview(mode)} Nav={Link ?? DefaultLink} layout="sheet" {...props} />
    </ItemLabelsProvider>
  );
}
