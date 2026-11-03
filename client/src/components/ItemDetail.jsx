import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ItemView, coverUrl, metaDescription } from "@epicmkt/ui";
import { items, logContactEvent, logEvent } from "../api/index.js";
import { useItemJsonLd } from "../hooks/useItemJsonLd.js";
import { showToast } from "../stores/toast.js";
import { t } from "../i18n/index.js";
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

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const external = { target: "_blank", rel: "noopener noreferrer" };
const MAX_TIMEOUT = 2147483647;
const HOLD_MS = 6000;
const LEAVE_MS = 260;

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

  const track = (name, extra) => logEvent(name, { businessId: business.id, itemId, ...extra });
  const onChat = (placement, variant) => {
    logContactEvent({ businessId: business.id, itemId, type: "whatsapp" });
    track("chat_seller_click", { placement, variantId: variant?.id ?? null, flash: Boolean(current?.flash) });
  };
  const onVisit = (placement) => track("visit_store_click", { placement });
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

  const state = gone ? "gone" : failed ? "failed" : current ? "ready" : "loading";

  const flashSlot = {
    leaving: Boolean(hold?.leaving),
    priceText: kesText,
    endedText: hold ? `${t("flash.endedNotice")}${hold.regularPrice !== null ? ` ${kesText(hold.regularPrice)}` : ""}` : null,
    sticky: (shown) => (current?.flash && !hold ? <FlashStickyBar endsAt={current.flash.sale.endsAt} price={shown.salePrice} visible={!bannerInView} /> : null),
    banner: (shown) => (
      <FlashBanner key={current.flash.sale.id} flash={current.flash} pricing={shown} unit={current.pricing?.unit} bannerRef={bannerRef} ended={Boolean(hold)} />
    )
  };

  return (
    <ItemView
      layout={layout}
      state={state}
      item={current}
      itemId={itemId}
      business={business}
      distanceKm={distanceKm}
      vanished={vanished}
      Link={Link}
      sheetRef={sheetRef}
      bodyRef={bodyRef}
      titleRef={titleRef}
      flash={flashSlot}
      offers={(shown) => <OfferStrip key={current.id} offers={current.offers} item={current} price={shown?.salePrice ?? null} onOpenProduct={onSelect} />}
      similar={(className) => (
        <SimilarItems key={`similar-${current.id}`} itemId={current.id} businessId={business.id} name={current.name} brand={current.brand ?? ""} className={className} />
      )}
      selective={selective}
      onClose={onClose}
      onRetry={() => refetch()}
      onChat={onChat}
      onVisit={onVisit}
      onCall={onCall}
      onShare={share}
      onReport={onReport}
      onExpandSpec={(panel) => track("spec_expand", { panel })}
    />
  );
}
