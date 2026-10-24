import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faFileImage, faFilePdf, faCrown } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { isValidSlug, shopDisplayUrl, shopUrl, whatsappShareUrl } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import { errorText } from "../../lib/errors.js";
import { SIZES, TAGLINE, downloadPdf, downloadPng, posterStyle, renderPoster } from "../../lib/poster.js";
import ui from "../../styles/ui.module.css";
import styles from "./qrPoster.module.css";

const SITE = import.meta.env?.VITE_SITE_URL;
const PREVIEW_PX = 760;

export default function QrPoster() {
  const shopQuery = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false, refetchOnMount: "always" });
  const shop = shopQuery.data?.shop;
  const [size, setSize] = useState("a4");
  const [drawing, setDrawing] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ kind: "", text: "" });
  const canvasRef = useRef(null);
  const timer = useRef(0);

  const style = posterStyle(shop?.planKey);
  const slugOk = isValidSlug(shop?.slug);
  const logoUrl = shop ? mediaUrl(shop.logoPath) : null;
  const poster = shop && slugOk ? { name: shop.name, slug: shop.slug, planKey: shop.planKey, logoUrl } : null;

  // The live preview is the real poster, drawn small. It redraws when the shop, its logo or its plan changes.
  useEffect(() => {
    if (!poster || !canvasRef.current) return undefined;
    let live = true;
    setDrawing(true);
    renderPoster(canvasRef.current, { ...poster, widthPx: PREVIEW_PX })
      .catch(() => live && setNote({ kind: "error", text: "We could not draw the poster. Refresh the page and try again." }))
      .finally(() => live && setDrawing(false));
    return () => {
      live = false;
    };
  }, [poster?.name, poster?.slug, poster?.planKey, poster?.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (kind, text) => {
    setNote({ kind, text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote({ kind: "", text: "" }), 4000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shopUrl(shop.slug, SITE));
      say("ok", "Link copied.");
    } catch {
      say("error", "Could not copy. Select the link and copy it by hand.");
    }
  };

  const save = async (kind) => {
    setBusy(kind);
    try {
      await (kind === "png" ? downloadPng : downloadPdf)(poster, size);
      say("ok", `${SIZES[size].label} ${kind.toUpperCase()} is ready in your downloads.`);
    } catch (err) {
      say("error", errorText(err, `We could not make the ${kind.toUpperCase()}. Try again.`));
    } finally {
      setBusy("");
    }
  };

  if (shopQuery.isPending) return <div className={ui.page}><p className={ui.muted} aria-busy="true">Loading your poster…</p></div>;
  if (shopQuery.isError) return <div className={ui.page}><div className={`${ui.banner} ${ui.tone_danger}`} role="alert"><p>{errorText(shopQuery.error, "We could not load your shop.")}</p></div></div>;

  return (
    <div className={ui.page}>
      <div className={ui.pageHead}>
        <h1>QR poster</h1>
        <p className={ui.muted}>Print it, stick it up, and customers scan to see your prices and location.</p>
      </div>

      {!shop.live && (
        <div className={`${ui.banner} ${ui.tone_warning}`} role="alert" data-testid="qr-not-live">
          <p>Your shop is not live right now, so scanning this code will not show it yet. It will work as soon as you are live again.</p>
        </div>
      )}
      {!slugOk && (
        <div className={`${ui.banner} ${ui.tone_danger}`} role="alert" data-testid="qr-no-slug">
          <p>Your shop link is not ready yet. Contact EpicMKT support.</p>
        </div>
      )}

      {slugOk && (
        <div className={styles.qrLayout}>
          <section className={styles.qrStage} aria-label="Poster preview">
            <div className={styles.qrPaper} data-style={style}>
              <canvas
                ref={canvasRef}
                className={styles.qrCanvas}
                role="img"
                aria-label={`${SIZES[size].label} poster for ${shop.name}. ${TAGLINE}. ${shopDisplayUrl(shop.slug, SITE)}`}
                data-testid="qr-canvas"
                data-size={size}
              />
              {drawing && <span className={styles.qrDrawing}>Drawing…</span>}
            </div>
          </section>

          <section className={`${ui.card} ${styles.qrPanel}`} aria-labelledby="qr-panel-title">
            <h2 id="qr-panel-title">Your poster</h2>

            <div className={styles.qrLinkBox}>
              <span className={styles.qrLinkLabel}>Your shop link</span>
              <strong className={styles.qrLink} data-testid="qr-link">{shopDisplayUrl(shop.slug, SITE)}</strong>
              <p className={ui.muted}>The code holds this public link only. No phone numbers, names or account details.</p>
            </div>

            <fieldset className={styles.qrSizes}>
              <legend>Paper size</legend>
              {Object.entries(SIZES).map(([key, s]) => (
                <label key={key} className={styles.qrSize} data-on={size === key}>
                  <input type="radio" name="paper" value={key} checked={size === key} onChange={() => setSize(key)} />
                  <strong>{s.label}</strong>
                  <span>{s.mm[0]} × {s.mm[1]} mm</span>
                </label>
              ))}
            </fieldset>

            <div className={styles.qrStyleNote} data-style={style} data-testid="qr-style">
              <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
              <p>
                {style === "branded"
                  ? <><strong>Fully branded poster.</strong> Your logo, your name and EpicMKT branding.</>
                  : <><strong>Plain poster.</strong> Premium shops get your logo and full branding. <Link className={ui.link} to="/business/subscription">See plans</Link></>}
              </p>
            </div>

            <div className={styles.qrActions}>
              <button type="button" className={ui.btn} onClick={() => save("pdf")} disabled={!!busy || drawing}>
                <FontAwesomeIcon icon={faFilePdf} aria-hidden="true" />
                {busy === "pdf" ? "Making PDF…" : `Download PDF (${SIZES[size].label})`}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => save("png")} disabled={!!busy || drawing}>
                <FontAwesomeIcon icon={faFileImage} aria-hidden="true" />
                {busy === "png" ? "Making PNG…" : `Download PNG (${SIZES[size].label})`}
              </button>
            </div>

            <div className={styles.qrShare}>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={copy}>
                <FontAwesomeIcon icon={note.text === "Link copied." ? faCheck : faCopy} aria-hidden="true" />
                Copy link
              </button>
              <a className={`${ui.btn} ${ui.btnGhost}`} href={whatsappShareUrl(shop.slug, shop.name, SITE)} target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" />
                Share on WhatsApp
              </a>
            </div>

            <p className={`${styles.qrNote} ${note.kind ? styles[`qr${note.kind[0].toUpperCase()}${note.kind.slice(1)}`] : ""}`} role="status" aria-live="polite" data-testid="qr-note">{note.text}</p>
          </section>
        </div>
      )}
    </div>
  );
}
