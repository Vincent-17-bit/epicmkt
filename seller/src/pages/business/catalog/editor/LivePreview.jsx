import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ItemCard, ProductGallery, StockTag } from "@epicmkt/ui";
import { formatKes } from "@epicmkt/shared";
import { readDevicePref, storeDevicePref } from "../cardItem.js";
import { prefersCalm } from "./hooks.js";
import { previewItemOf, priceSummary } from "./model.js";
import styles from "./editor.module.css";

const VIEWS = [["card", "Card"], ["page", "Page"]];
const DEVICES = [["mobile", "Mobile"], ["desktop", "Desktop"]];
const DESIGN_WIDTH = { mobile: 375, desktop: 1040 };

// The preview is drawn at a real phone or laptop width and then scaled to fit the pane, so what you see is the layout a
// customer gets, not a squeezed one. It is inert: nothing in it can be tapped or tabbed to, so it never competes with the form.
function ScaledFrame({ width, children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: null });
  useLayoutEffect(() => {
    inner.current?.setAttribute("inert", "");
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
  }, [width]);
  return (
    <div ref={outer} className={styles.frameOuter} style={fit.height ? { blockSize: fit.height } : undefined}>
      <div ref={inner} className={styles.frameInner} style={{ inlineSize: width, transform: `scale(${fit.scale})` }}>{children}</div>
    </div>
  );
}

const priceParts = (form, item) => {
  if (form.priceType === "free") return { main: "Free" };
  if (form.priceType === "contact" || !item.pricing) return { main: "Contact for price" };
  const { regularPrice, salePrice, savings, discountPercent } = item.pricing;
  const unit = form.unit.trim() ? ` ${form.unit.trim()}` : "";
  let main = formatKes(salePrice);
  if (form.priceType === "from") main = `From ${main}`;
  if (form.priceType === "range" && item.priceMax) main = `${formatKes(regularPrice)} to ${formatKes(item.priceMax)}`;
  return { main: `${main}${unit}`, was: savings > 0 ? formatKes(regularPrice) : null, off: savings > 0 ? discountPercent : 0 };
};

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

function PageView({ form, item, images, media, hl }) {
  const gallery = useMemo(() => (media?.length ? media : images.map((url, i) => ({ id: `p${i}`, kind: "image", url }))), [images, media]);
  const price = priceParts(form, item);
  const highlights = form.highlights.filter((h) => h.text.trim());
  const specs = form.specs.filter((s) => s.label.trim() && s.value.trim());
  const includes = form.includes.filter((t) => t.trim());
  const paragraphs = form.description.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  const groups = [...new Set(specs.map((s) => s.group || "Features & Specs"))];
  return (
    <article className={styles.pg}>
      <div className={styles.pgGallery} data-hl={hl("media")}>
        {gallery.length ? <ProductGallery media={gallery} name={item.name} /> : <div className={styles.pgNoPhoto}>No photo yet</div>}
      </div>
      <div className={styles.pgInfo}>
        {form.brand.trim() && <p className={styles.pgBrand} data-hl={hl("brand")}>{form.brand.trim()}</p>}
        <h3 className={styles.pgName} data-hl={hl("name")}>{item.name}</h3>
        {form.shortDescription.trim() && <p className={styles.pgShort} data-hl={hl("short")}>{form.shortDescription.trim()}</p>}
        <p className={styles.pgPrice} data-hl={hl("price", "stock")}>
          <strong>{price.main}</strong>
          {price.was && <s>{price.was}</s>}
          {price.off > 0 && <span className={styles.pgOff}>-{price.off}%</span>}
          <StockTag item={item} />
        </p>
        {highlights.length > 0 && (
          <ul className={styles.pgBullets} data-hl={hl("highlights")}>
            {highlights.map((h, i) => <li key={i}>{h.title.trim() && <strong>{h.title.trim()} </strong>}{h.text.trim()}</li>)}
          </ul>
        )}
        {paragraphs.length > 0 && (
          <div className={styles.pgDesc} data-hl={hl("description")}>{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
        )}
        {includes.length > 0 && (
          <div data-hl={hl("includes")}>
            <h4 className={styles.pgH}>What is included</h4>
            <ul className={styles.pgBullets}>{includes.map((t, i) => <li key={i}>{t.trim()}</li>)}</ul>
          </div>
        )}
        {specs.length > 0 && (
          <div data-hl={hl("specs")}>
            {groups.map((g) => (
              <div key={g}>
                <h4 className={styles.pgH}>{g}</h4>
                <dl className={styles.pgSpecs}>
                  {specs.filter((s) => (s.group || "Features & Specs") === g).map((s, i) => <div key={i}><dt>{s.label.trim()}</dt><dd>{s.value.trim()}</dd></div>)}
                </dl>
              </div>
            ))}
          </div>
        )}
        {(form.packSize.trim() || form.terms.trim()) && (
          <div data-hl={hl("pack", "terms")}>
            {form.packSize.trim() && <p><strong>Pack size:</strong> {form.packSize.trim()}</p>}
            {form.terms.trim() && <p className={styles.pgTerms}>{form.terms.trim()}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function LivePreview({ form, images, media, area }) {
  const [view, setView] = useState(() => readDevicePref("seller.editor.previewView", "card", VIEWS.map((v) => v[0])));
  const [device, setDevice] = useState(() => readDevicePref("seller.editor.previewDevice", "mobile", DEVICES.map((d) => d[0])));
  const pick = (setter, key) => (value) => { setter(value); storeDevicePref(key, value); };
  const item = useMemo(() => previewItemOf(form, images), [form, images]);
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
        <ScaledFrame width={DESIGN_WIDTH[device]}>
          <div className={styles.device} data-device={device}>
            {view === "card" ? <CardView form={form} item={item} hl={hl} device={device} /> : <PageView form={form} item={item} images={images} media={media} hl={hl} />}
          </div>
        </ScaledFrame>
      </div>
      <p className={styles.previewNote}>Updates as you type. Customers see {view === "card" ? "the card" : "the item page"} like this on {device === "mobile" ? "a phone" : "a computer"}.</p>
    </section>
  );
}

