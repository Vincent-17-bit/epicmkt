import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { choiceToParam, whatsappLink } from "@epicmkt/shared";
import { items, logContactEvent, logEvent } from "../api/index.js";
import { chatMessage, choiceLines, defaultVariantId, orderMessage } from "../lib/itemView.js";
import { lineFor, optionShown } from "../lib/lineFor.js";
import { savedList, lineKey } from "../lib/savedList.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { t } from "../i18n/index.js";
import { ShareSheet, coverUrl, metaDescription } from "@epicmkt/ui";
import { shareLabels } from "../lib/shareLabels.js";

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
import SectionNav from "./item/SectionNav.jsx";
import TopBar from "./item/TopBar.jsx";
import styles from "./ItemDetail.module.css";

const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

// `layout="sheet"` is the dialog laid over a store's page. `layout="page"` is the same content as a page of its own
// (no scrim, no focus trap, no scroll lock): the item's address is /b/<store>/i/<item>.
// This file owns the data, the timers and the handlers; what is drawn lives in ./item (see item/README.md for the slot map).
// `preview`: an item made by the seller's editor (see api/flash/preview.js). It is shown as it is: nothing is fetched, logged or counted.
export default function ItemDetail({ business, itemId, distanceKm, onClose, onSelect, onReport, layout = "sheet", preview = null }) {
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
  const [qtyChoice, setQtyChoice] = useState({ itemId: null, value: null });
  // Made to measure: whether the buyer chose it for this item, and what they gave (see item/MadeToMeasure.jsx).
  const [madeChoice, setMadeChoice] = useState({ itemId: null, on: false, result: null });

  const query = useQuery({
    queryKey: ["item", business.id, itemId],
    queryFn: () => items.getDetail(itemId, { businessId: business.id }),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: !preview
  });
  const detail = preview ?? query.data;
  const { isError, error, refetch, dataUpdatedAt } = preview ? { isError: false, error: null, refetch: () => {}, dataUpdatedAt: 0 } : query;

  const gone = isError && error?.name === "NotFoundError";
  const fresh = !gone && detail?.id === itemId ? detail : null;
  const failed = isError && !gone && !fresh;
  const vanished = gone && detail?.id === itemId;
  const [hold, setHold] = useState(null);
  const [sharing, setSharing] = useState(false);
  const lastLive = useRef(null);
  const current = hold && fresh && hold.id === fresh.id ? { ...fresh, flash: hold.flash, pricing: hold.pricing } : fresh;

  useItemJsonLd(preview ? null : fresh);

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

  // Focus moves to the title so a screen reader reads the item that opened. The pop-up always does it. The full page does it after
  // moving from one page to another inside the app, but not on the page's very first load, where the browser already starts at the
  // top (history index 0): there it only took the focus away from the page itself.
  const titled = useRef(false);
  useEffect(() => {
    if (preview) return;   // the seller is typing in the editor: the preview must not take the focus (or draw its ring)
    if (!current && !gone) return;
    const first = !titled.current;
    titled.current = true;
    if (isPage && first && (window.history.state?.idx ?? 0) === 0) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [current?.id, gone, itemId]);

  useEffect(() => {
    if (preview || !current || viewed.current === current.id) return;
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
  const seller = useLiveStatus(current?.business ?? null);
  const sellerCount = seller ? (seller.productCount ?? (seller.slug === business.slug ? business.productCount : null)) : null;
  // One quantity for the page (units, a measure, or a quantity-tier order). It resets with the item and falls back to the least that can be bought.
  // The page, the Saved drawer and the message to a shop all take the price from lineFor (lib/lineFor.js), so they always agree.
  // When this item and option are saved, the page starts at the saved quantity.
  const savedParam = option ? choiceToParam(option.axes, option.choice) : "";
  const savedQty = preview ? null : (savedList().get(lineKey(itemId, savedParam))?.qty ?? null);
  const picked = qtyChoice.itemId === itemId && Number.isFinite(qtyChoice.value) ? qtyChoice.value : savedQty;
  const line = current ? lineFor({ item: current, option, legacyVariant, qty: picked }) : null;
  const shown = line ? line.shown : option ? null : (legacyVariant ?? null);
  const tiers = line?.tiers ?? null;
  const qtyInfo = line?.info ?? null;
  const qty = line?.qty ?? 1;
  const setQty = (value) => setQtyChoice({ itemId, value });
  const order = line?.order ?? null;
  // Changing the quantity updates the saved line (after 300 ms, without a toast). Starting at the saved quantity writes nothing.
  useEffect(() => {
    if (preview || !current || qtyChoice.itemId !== itemId || !Number.isFinite(qtyChoice.value)) return undefined;
    const key = lineKey(itemId, savedParam);
    const timer = window.setTimeout(() => {
      const have = savedList().get(key);
      if (have && have.qty !== qty) savedList().setQty(key, qty);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [preview, current, itemId, savedParam, qty, qtyChoice]);
  const made = madeChoice.itemId === itemId && madeChoice.on ? madeChoice : { itemId, on: false, result: null };
  const madeToMeasure = current?.customSize && made.on && made.result?.ok ? made.result : null;
  const variantParam = option ? choiceToParam(option.axes, option.choice) : "";
  const itemLink = current && !preview ? `${window.location.origin}/b/${business.slug}/i/${encodeURIComponent(current.id)}${variantParam ? `?v=${encodeURIComponent(variantParam)}` : ""}` : "";
  const withLink = (text) => [text, itemLink].filter(Boolean).join("\n");
  const message = !current ? "" : withLink(madeToMeasure ? `Hi, I'd like ${madeToMeasure.message} on EpicMKT` : chatMessage({ item: current, variant, pricing: current.pricing, greeting: business.shopSettings?.whatsappGreeting }));
  // A shop with no WhatsApp number is still reachable on the phone number it gave: chat and order go to that number.
  const reach = seller?.whatsapp || seller?.phone || "";
  const chatHref = seller && reach ? whatsappLink(reach, message) : undefined;
  const orderReady = Boolean(current && order && !option?.unmatched && (!made.on || madeToMeasure));
  const orderText = !orderReady ? "" : withLink(madeToMeasure ? `Hi, I'd like ${madeToMeasure.message} on EpicMKT` : orderMessage({ item: current, shop: seller?.name ?? business.name, choices: choiceLines(option, variant), order: tiers ? { ...order, unit: null } : order }));
  const orderHref = orderReady && reach ? whatsappLink(reach, orderText) : undefined;

  const track = (name, extra) => { if (!preview) logEvent(name, { businessId: business.id, itemId, ...extra }); };
  const onChat = (placement) => () => {
    if (preview) return;
    logContactEvent({ businessId: business.id, itemId, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: Boolean(current?.flash), ...(order ? { quantity: order.qty } : {}) });
  };
  const onVisit = (placement) => () => track("visit_store_click", { placement });
  const onCall = () => { if (!preview) logContactEvent({ businessId: business.id, itemId, type: "call" }); };

  const shareUrl = `${typeof window === "undefined" ? "" : window.location.origin}${isPage ? `/b/${business.slug}/i/${encodeURIComponent(itemId)}` : `/b/${business.slug}?item=${encodeURIComponent(itemId)}`}`;
  const onShare = () => setSharing(true);

  // Everything a slot may read. Slots take this one object and pick what they need, so adding a field here does not touch the others.
  const ctx = {
    item: current,
    itemId,
    business,
    layout,
    isPage,
    vanished,
    shown,
    line,
    preview: Boolean(preview),
    variant,
    option,
    activeId,
    qty,
    setQty,
    order,
    custom: current?.customSize ? { config: current.customSize, on: made.on, result: made.result, setOn: (on) => setMadeChoice({ itemId, on, result: null }), setResult: (result) => setMadeChoice({ itemId, on: true, result }) } : null,
    selectVariant: (variantId) => setChoice({ itemId, variantId }),
    seller,
    sellerCount,
    distanceKm,
    chatHref,
    orderHref,
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
          {current && <SectionNav scrollRef={isPage ? null : bodyRef} itemId={current.id} />}
          {current && <ItemLayout ctx={ctx} />}
        </div>

        <StickyNav ctx={ctx} />
      </section>
      <ShareSheet open={sharing} onClose={() => setSharing(false)} url={shareUrl} title={current?.name ?? business.name} text={`${current?.name ?? business.name} on EpicMKT`} labels={shareLabels()} />
    </div>
  );
}
