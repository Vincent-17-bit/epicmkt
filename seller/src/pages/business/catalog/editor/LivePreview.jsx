import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemCard, ItemView } from "@epicmkt/ui";
import { defaultVariantId } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { readDevicePref, storeDevicePref } from "../cardItem.js";
import { prefersCalm } from "./hooks.js";
import { clientBase, liveLinkOf, publicItemOf } from "../panel/publicItem.js";
import { previewFieldsOf, previewItemOf, priceSummary } from "./model.js";
import { previewPayload } from "./previewPayload.js";
import styles from "./editor.module.css";

const FRAME_HEIGHT = { mobile: 760, desktop: 820 };

// The item page of the buyer site itself (its /preview/item page), in a frame at phone or laptop width. The form is posted to it as it
// changes, so the seller sees the real page (photos, options and prices, size guide, specifications, 3D) and not an imitation of it.
// If the page does not answer (an old buyer site without /preview/item, no connection, or a buyer site that does not accept this seller
// address) `onFail` is called and the editor shows its own simpler page instead, so the preview never stays blank.
const SITE_WAIT_MS = 12_000;
function SitePreview({ base, payload, device, slug, onFail }) {
  const frame = useRef(null);
  const ready = useRef(false);
  const latest = useRef(payload);
  latest.current = payload;
  const [loaded, setLoaded] = useState(false);
  const origin = useMemo(() => { try { return new URL(base).origin; } catch { return "*"; } }, [base]);
  const send = () => frame.current?.contentWindow?.postMessage({ type: "epicmkt:item-preview", payload: latest.current }, origin);
  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "epicmkt:preview-refused") { onFail?.(); return; }
      if (e.data?.type !== "epicmkt:preview-ready") return;
      ready.current = true;
      setLoaded(true);
      send();
    };
    window.addEventListener("message", onMessage);
    const wait = setTimeout(() => { if (!ready.current) onFail?.(); }, SITE_WAIT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(wait); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready.current) return undefined;
    const t = setTimeout(send, 200);
    return () => clearTimeout(t);
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = `${base}/preview/item?shop=${encodeURIComponent(slug ?? "")}`;
  return (
    <div className={styles.siteFrame} style={{ blockSize: FRAME_HEIGHT[device] }}>
      {!loaded && <p className={styles.siteLoading} role="status">Opening the item page…</p>}
      <iframe ref={frame} title="Your item on EpicMKT" src={src} className={styles.siteIframe} loading="eager" />
    </div>
  );
}

const VIEWS = [["card", "Card"], ["page", "Page"]];
const DEVICES = [["mobile", "Mobile"], ["desktop", "Desktop"]];
const DESIGN_WIDTH = { mobile: 375, desktop: 1040 };

// The preview is drawn at a real phone or laptop width and then scaled to fit the pane, so what you see is the layout a
// customer gets, not a squeezed one. It is inert: nothing in it can be tapped or tabbed to, so it never competes with the form.
export function ScaledFrame({ width, children, interactive = false }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: null });
  useLayoutEffect(() => {
    // The drawn preview is inert; the real page (an iframe of the buyer site) can be tapped, so the seller can try the options.
    if (interactive) inner.current?.removeAttribute("inert");
    else inner.current?.setAttribute("inert", "");
    const measure = () => {
      const avail = outer.current?.clientWidth;
      if (!avail || !inner.current) return;
      const scale = Math.min(1, avail / width);
      setFit({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(outer.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width, interactive]);
  return (
    <div ref={outer} className={styles.frameOuter} style={fit.height ? { blockSize: fit.height } : undefined}>
      <div ref={inner} className={styles.frameInner} style={{ inlineSize: width, transform: `scale(${fit.scale})` }}>{children}</div>
    </div>
  );
}

function CardView({ form, item, hl, device }) {
  return (
    <div className={styles.cardView} data-device={device}>
      <figure className={styles.cardFigure} data-hl={hl("media", "name", "price", "stock")}>
        <ItemCard item={item} />
        <figcaption className={styles.figCaption}>On your shop page and in lists</figcaption>
      </figure>
      <figure className={styles.snippetFigure}>
        <div className={styles.snippet}>
          <span className={styles.snippetThumb} aria-hidden="true">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}</span>
          <span className={styles.snippetText}>
            <span className={styles.snippetName} data-hl={hl("name")}>{item.name}</span>
            <span className={styles.snippetShort} data-hl={hl("short")}>{form.shortDescription.trim() || <span className={styles.muted}>Your short description shows here</span>}</span>
          </span>
        </div>
        <figcaption className={styles.figCaption}>In search and when shared</figcaption>
      </figure>
    </div>
  );
}

const PART_AREAS = { price: ["price", "stock", "variants"], specs: ["specs", "includes", "terms", "pack"] };

function PageView({ form, images, media, hl }) {
  const gallery = useMemo(() => (media?.length ? media : images.map((url) => ({ kind: "image", url }))), [images, media]);
  const item = useMemo(() => publicItemOf(previewFieldsOf(form), { gallery }), [form, gallery]);
  const [pick, setPick] = useState(null);
  const options = item.pricing?.variants ?? [];
  const activeId = options.some((v) => v.id === pick) ? pick : defaultVariantId(item.pricing);
  const shown = options.find((v) => v.id === activeId) ?? item.pricing;
  return <ItemView item={item} shown={shown} activeId={activeId} onVariant={setPick} layout="page" Heading="h3" marks={(part) => hl(...(PART_AREAS[part] ?? [part]))} />;
}

const props3dId = (item) => item?.id ?? null;

export default function LivePreview({ form, images, media, area, tiles = [], item: itemProp = null, business = null, shop = null, extras = null }) {
  const [view, setView] = useState(() => readDevicePref("seller.editor.previewView", "card", VIEWS.map((v) => v[0])));
  const [device, setDevice] = useState(() => readDevicePref("seller.editor.previewDevice", "mobile", DEVICES.map((d) => d[0])));
  const pick = (setter, key) => (value) => { setter(value); storeDevicePref(key, value); };
  const card = useMemo(() => previewItemOf(form, images), [form, images]);
  const base = clientBase();
  // The real buyer page did not open (see SitePreview): use the editor's own page view for the rest of this visit.
  const [siteDown, setSiteDown] = useState(false);
  const site = siteDown ? "" : base;
  const saved = props3dId(itemProp);
  const view3d = useQuery({ queryKey: ["media3d", saved], queryFn: () => api.getItemMedia3d(saved), enabled: Boolean(site && saved && view === "page"), staleTime: 30_000 });
  const payload = useMemo(() => (site && view === "page" ? previewPayload({ form, item: itemProp, business, shop, tiles, media3d: view3d.data?.media3d ?? [], extras }) : null), [site, view, form, itemProp, business, shop, tiles, view3d.data, extras, extras?.version, extras?.saved]);
  const live = itemProp && !itemProp.draft && itemProp.visible ? liveLinkOf(shop?.slug, itemProp.id) : "";
  const item = card;
  const hl = (...ids) => (ids.includes(area) ? "" : undefined);
  const body = useRef(null);

  // While a field is focused, bring its part of the preview into view.
  useEffect(() => {
    if (!area || !body.current) return;
    const el = body.current.querySelector("[data-hl]");
    el?.scrollIntoView?.({ block: "nearest", behavior: prefersCalm() ? "auto" : "smooth" });
  }, [area, view, device]);

  return (
    <section className={styles.preview} aria-label="Live preview">
      <header className={styles.previewHead}>
        <h2 className={styles.previewTitle}>Live preview</h2>
        <div className={styles.toggles}>
          <div role="group" aria-label="Preview type" className={styles.segment}>
            {VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => pick(setView, "seller.editor.previewView")(id)}>{label}</button>)}
          </div>
          <div role="group" aria-label="Device" className={styles.segment}>
            {DEVICES.map(([id, label]) => <button key={id} type="button" aria-pressed={device === id} onClick={() => pick(setDevice, "seller.editor.previewDevice")(id)}>{label}</button>)}
          </div>
        </div>
      </header>
      <div ref={body} className={styles.previewBody} tabIndex={0} role="region" aria-label={`Preview of ${item.name}, ${view} view, ${device} size`}>
        <p className={styles.sr}>{item.name}. {priceSummary(form)}.</p>
        <ScaledFrame width={DESIGN_WIDTH[device]} interactive={Boolean(site && view === "page")}>
          <div className={styles.device} data-device={device}>
            {view === "card" ? <CardView form={form} item={item} hl={hl} device={device} /> : site ? <SitePreview base={site} payload={payload} device={device} slug={shop?.slug} onFail={() => setSiteDown(true)} /> : <PageView form={form} images={images} media={media} hl={hl} />}
          </div>
        </ScaledFrame>
      </div>
      <p className={styles.previewNote}>
        {view === "page" && site ? "This is the real EpicMKT item page, filled with what you type. " : view === "page" && siteDown ? "The live item page could not open here, so this is a simpler preview. " : "Updates as you type. "}
        Customers see {view === "card" ? "the card" : "the item page"} like this on {device === "mobile" ? "a phone" : "a computer"}.
        {live && <> <a href={live} target="_blank" rel="noreferrer">Open the live page</a></>}
      </p>
    </section>
  );
}

