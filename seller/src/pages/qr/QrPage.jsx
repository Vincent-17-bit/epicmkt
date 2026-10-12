import { useEffect, useRef, useState } from "react";
import { faCopy, faDownload, faEnvelope, faMessage, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { POSTER_SIZES, defaultCaption, displayUrl, mailUrl, qrUrl, shopUrl, smsUrl, whatsappUrl, withLink, CAPTION_MAX } from "@epicmkt/shared";
import { Button, Field, UpgradePrompt, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { SITE_URL, useWorkspace } from "../../lib/workspace.js";
import styles from "./qr.module.css";

const loadPoster = () => import("../../lib/poster.js");

const save = (bytes, type, name) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export default function QrPage() {
  const ws = useWorkspace();
  const biz = ws.business;
  const [size, setSize] = useState("A4");
  const [caption, setCaption] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(null);
  const host = useRef(null);
  const canvasRef = useRef(null);
  const style = ws.premium ? "branded" : "plain";
  const shareLink = biz ? shopUrl(SITE_URL, biz.slug) : "";
  const qrLink = biz ? qrUrl(SITE_URL, biz.slug) : "";
  const display = biz ? displayUrl(SITE_URL, biz.slug) : "";
  const live = Boolean(biz) && !ws.readOnly;
  const message = biz ? withLink(caption || defaultCaption(biz.name, shareLink), shareLink) : "";

  useEffect(() => {
    if (biz) setCaption((c) => c || defaultCaption(biz.name, shareLink));
  }, [biz, shareLink]);

  useEffect(() => {
    if (!biz) return undefined;
    let cancelled = false;
    setReady(false);
    (async () => {
      const poster = await loadPoster();
      const [matrix, logo] = await Promise.all([poster.loadQr(qrLink), style === "branded" ? poster.loadLogo(biz.logo_url) : null]);
      const canvas = await poster.renderPoster({ size, style, name: biz.name, tagline: biz.tagline, logo, matrix, display, env: poster.browserEnv });
      if (cancelled || !host.current) return;
      canvasRef.current = canvas;
      host.current.replaceChildren(canvas);
      setReady(true);
    })().catch(() => !cancelled && toast("The poster could not be drawn. Please reload the page."));
    return () => { cancelled = true; };
  }, [biz, size, style, qrLink, display]);

  const download = async (kind) => {
    if (!canvasRef.current || !biz) return;
    setBusy(kind);
    try {
      const poster = await loadPoster();
      const png = await poster.pngBytes(canvasRef.current, poster.browserEnv);
      if (kind === "png") save(png, "image/png", poster.posterFileName(biz.slug, size, "png"));
      else save(await poster.buildPdf(png, size), "application/pdf", poster.posterFileName(biz.slug, size, "pdf"));
    } catch {
      toast("The download did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast("Link copied");
    } catch {
      toast(`Copy this link: ${shareLink}`);
    }
  };

  const nativeShare = async () => {
    try {
      const poster = await loadPoster();
      const png = await poster.pngBytes(canvasRef.current, poster.browserEnv);
      const file = new File([png], poster.posterFileName(biz.slug, size, "png"), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: message });
      else await navigator.share({ text: message });
    } catch (e) {
      if (e?.name !== "AbortError") toast("Sharing did not work. Use WhatsApp, SMS or email instead.");
    }
  };

  const anchor = (href) => (live ? { href, target: "_blank", rel: "noopener noreferrer" } : { "aria-disabled": "true", role: "link" });

  if (ws.isPending || !biz) return null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>QR and poster</h1>
      {ws.readOnly && <p className={styles.meta}>Your listing is not live, so customers who scan would not see your page. Downloads and sharing are off until it is live again.</p>}

      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Poster preview">
          <h2 className={styles.sub}>Preview</h2>
          <div className={styles.radios} role="radiogroup" aria-label="Paper size">
            {Object.keys(POSTER_SIZES).map((s) => (
              <label key={s} className={styles.radio}>
                <input type="radio" name="size" checked={size === s} onChange={() => setSize(s)} />
                {s} {POSTER_SIZES[s].mm[0]} by {POSTER_SIZES[s].mm[1]} mm
              </label>
            ))}
          </div>
          <div className={styles.previewWrap}>
            {!ready && <div className={styles.skeleton} aria-busy="true" />}
            <div ref={host} className={styles.preview} hidden={!ready} aria-label={`Poster preview for ${biz.name}`} role="img" />
          </div>
          <div className={styles.buttons}>
            <Button variant="primary" icon={faDownload} disabled={!ready || !live || Boolean(busy)} onClick={() => download("png")}>{busy === "png" ? "Preparing" : "Download PNG"}</Button>
            <Button icon={faDownload} disabled={!ready || !live || Boolean(busy)} onClick={() => download("pdf")}>{busy === "pdf" ? "Preparing" : "Download PDF"}</Button>
          </div>
          <p className={styles.meta}>Print-ready at 300 dpi. The QR code holds only your public link.</p>
          {!ws.premium && <UpgradePrompt>Premium adds your logo, name and tagline to the poster. EpicMKT branding stays on every poster.</UpgradePrompt>}
        </section>

        <section className={styles.panel} aria-label="Share">
          <h2 className={styles.sub}>Share your link</h2>
          <p className={styles.link}>{display}</p>
          <Field label="Message" hint={`Your link is added automatically. ${caption.length} of ${CAPTION_MAX} characters.`}>
            {(p) => <textarea {...p} className={inputClass} value={caption} maxLength={CAPTION_MAX} onChange={(e) => setCaption(e.target.value)} />}
          </Field>
          <div className={styles.buttons}>
            <Button size="sm" onClick={() => setCaption(defaultCaption(biz.name, shareLink))}>Reset message</Button>
          </div>
          <div className={styles.buttons}>
            <Button as="a" icon={faWhatsapp} {...anchor(whatsappUrl(message))}>WhatsApp</Button>
            <Button as="a" icon={faMessage} {...anchor(smsUrl(message))}>SMS</Button>
            <Button as="a" icon={faEnvelope} {...anchor(mailUrl(`${biz.name} on EpicMKT`, message))}>Email</Button>
            <Button icon={faCopy} disabled={!live} onClick={copy}>Copy link</Button>
            {typeof navigator !== "undefined" && navigator.share && <Button icon={faShareNodes} disabled={!live || !ready} onClick={nativeShare}>Share poster</Button>}
          </div>
        </section>
      </div>
    </div>
  );
}
