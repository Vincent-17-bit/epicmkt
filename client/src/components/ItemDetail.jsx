import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappLink } from "@epicmkt/shared";
import { items, logContactEvent, logEvent } from "../api/index.js";
import { chatMessage, defaultVariantId } from "../lib/itemView.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
import { coverUrl, metaDescription } from "@epicmkt/ui";

import { useOptionSelection } from "../hooks/useOptionSelection.js";
import { useUrgency } from "../hooks/useCountdown.js";
import { useLiveStatus } from "../hooks/useLiveStatus.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useInView } from "../hooks/useInView.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { usePageMeta } from "../hooks/usePageMeta.js";
import ItemLayout from "./item/ItemLayout.jsx";
import { StoreMore } from "./item/Recommend.jsx";
import { Gone, LoadFailed, Loading } from "./item/States.jsx";
import StickyNav from "./item/StickyNav.jsx";
import TopBar from "./item/TopBar.jsx";
import styles from "./ItemDetail.module.css";

// What the header and the message to the seller use for a chosen combination: its price in the shape of pricing (regular, sale,
// savings), and its name. A combination the seller does not sell has a name and no price. During a flash sale the item's own
// flash pricing stays in charge of the header (price rules for options come later), but the chat still names the choice.
function optionShown(option, current) {
  const v = option.variant;
  const base = { id: v?.id ?? null, label: option.label };
  if (!v || !Number.isFinite(v.price)) return { ...base, regularPrice: NaN, salePrice: NaN, savings: 0, discountPercent: 0, unit: current?.pricing?.unit ?? null };
  const sale = Number.isFinite(v.salePrice) && v.salePrice < v.price ? v.salePrice : v.price;
  const savings = v.price - sale;
  return { ...base, regularPrice: v.price, salePrice: sale, savings, discountPercent: savings > 0 ? Math.round((savings / v.price) * 100) : 0, unit: current?.pricing?.unit ?? null, plainSale: true };
}

const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

// `layout="sheet"` is the dialog laid over a store's page. `layout="page"` is the same content as a page of its own
// (no scrim, no focus trap, no scroll lock): the item's address is /b/<store>/i/<item>.
// This file owns the data, the timers and the handlers; what is drawn lives in ./item (see item/README.md for the slot map).
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
      ? { description: metaDescription(fresh), image: coverUrl(fresh) ?? business.coverUrl ?? business.logoUrl, path: `/b/${business.slug}/i/${encodeURIComponent(fresh.id)}` }
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

    return () => {
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useFocusTrap({
    active: !isPage,
    getContainer: () => sheetRef.current,
    onEscape: () => closeRef.current(),
    wrapFromOutside: true,
    paused: () => Boolean(document.querySelector("dialog[open]"))
  });

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
    logContactEvent({ businessId: business.id, itemId: current.id, type: "view" });
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
  const legacyVariant = variants.find((v) => v.id === activeId) ?? null;
  // Option axes (colour, size, storage...): null for an item without them, which then behaves exactly as before.
  const option = useOptionSelection(current, itemId);
  const optionPrice = option ? optionShown(option, current) : null;
  const variant = option ? optionPrice : legacyVariant;
  const shown = option ? (current?.flash ? current.pricing : option.variant ? optionPrice : null) : (legacyVariant ?? current?.pricing ?? null);
  const seller = useLiveStatus(current?.business ?? null);
  const sellerCount = seller ? (seller.productCount ?? (seller.slug === business.slug ? business.productCount : null)) : null;
  const message = current ? chatMessage({ item: current, variant, pricing: current.pricing, greeting: business.shopSettings?.whatsappGreeting }) : "";
  const chatHref = seller ? whatsappLink(seller.whatsapp, message) : undefined;

  const track = (name, extra) => logEvent(name, { businessId: business.id, itemId, ...extra });
  const onChat = (placement) => () => {
    logContactEvent({ businessId: business.id, itemId, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: Boolean(current?.flash) });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => logContactEvent({ businessId: business.id, itemId, type: "call" });

  const onShare = async () => {
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

  // Everything a slot may read. Slots take this one object and pick what they need, so adding a field here does not touch the others.
  const ctx = {
    item: current,
    itemId,
    business,
    layout,
    isPage,
    vanished,
    shown,
    variant,
    option,
    activeId,
    selectVariant: (variantId) => setChoice({ itemId, variantId }),
    seller,
    sellerCount,
    distanceKm,
    chatHref,
    hold,
    bannerRef,
    bannerInView,
    Heading,
    titleRef,
    track,
    onChat,
    onVisit,
    onCall,
    onShare,
    onClose,
    onSelect,
    onReport,
    onRetry: () => refetch()
  };
  ctx.selective = <StoreMore ctx={ctx} />;

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
        <TopBar ctx={ctx} />

        <div ref={bodyRef} className={styles.body}>
          {failed && <LoadFailed ctx={ctx} />}
          {gone && <Gone ctx={ctx} />}
          {!current && !gone && !failed && <Loading ctx={ctx} />}
          {current && <ItemLayout ctx={ctx} />}
        </div>

        <StickyNav ctx={ctx} />
      </section>
    </div>
  );
}
