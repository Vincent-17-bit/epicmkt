import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBusiness } from "../api/index.js";
import { previewDetail, releasePreviewUrls } from "../api/flash/preview.js";
import ItemDetail from "../components/ItemDetail.jsx";
import styles from "./PreviewItem.module.css";

// /preview/item?shop=<slug>: the item page exactly as buyers get it, filled by the seller's editor while they type.
// The seller app shows this page in a frame and posts the form to it (type "epicmkt:item-preview"). Only the seller app's own address
// may send it (VITE_SELLER_URL, comma separated; any localhost while developing), so nobody can use this page to show made-up items
// under this site's name. Nothing here is saved, counted or indexed.
const allowed = () => {
  const list = String(import.meta.env.VITE_SELLER_URL ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  return (origin) => list.includes(origin) || origin === window.location.origin || (import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
};

export default function PreviewItem() {
  const [params] = useSearchParams();
  const slug = params.get("shop") ?? "";
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const ok = allowed();
    const onMessage = (event) => {
      if (!ok(event.origin) || event.data?.type !== "epicmkt:item-preview") return;
      setPayload(event.data.payload ?? null);
    };
    window.addEventListener("message", onMessage);
    // Tell the editor the page is ready for the first message (the frame may load after the editor has sent one).
    window.parent?.postMessage({ type: "epicmkt:preview-ready" }, "*");
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => { window.removeEventListener("message", onMessage); robots.remove(); releasePreviewUrls(); };
  }, []);

  // The real shop page data when the shop is public (its category, delivery, hours...); otherwise what the editor sent.
  const shop = useQuery({ queryKey: ["business", slug], queryFn: () => getBusiness(slug), enabled: Boolean(slug), retry: false, staleTime: 60_000 });
  const detail = useMemo(() => (payload ? previewDetail(payload) : null), [payload]);
  const business = useMemo(() => {
    if (shop.data) return shop.data;
    const b = payload?.business ?? {};
    return { id: b.id ?? "preview-shop", slug: b.slug ?? slug, name: b.name ?? "Your shop", category: b.category ?? null, attributes: null, productCount: null, shopSettings: {} };
  }, [shop.data, payload, slug]);

  if (!detail) {
    return <p className={styles.waiting} role="status">Waiting for your item…</p>;
  }
  return (
    <div className={styles.frame} data-preview="">
      <ItemDetail layout="page" business={business} itemId={detail.id} preview={detail} distanceKm={null} onClose={() => {}} onSelect={() => {}} onReport={() => {}} />
    </div>
  );
}
