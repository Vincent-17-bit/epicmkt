import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { PDF_MAX_ITEMS, catalogueFileName, catalogueMessage, catalogueWhatsappUrl, isValidSlug, sectionCounts, shareableItems } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { mediaUrl } from "../../../api/shape.js";
import { copyText } from "../../../lib/copy.js";
import { errorText } from "../../../lib/errors.js";
import Modal from "./Modal.jsx";
import styles from "./catalog.module.css";
import share from "./ShareDialog.module.css";

const SITE = import.meta.env?.VITE_SITE_URL;
const CLOUD = import.meta.env?.VITE_CLOUDINARY_CLOUD_NAME;
const SUPABASE = import.meta.env?.VITE_SUPABASE_URL;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function ShareDialog({ open, onClose, items, shop, makePdf }) {
  const preview = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false });
  const [picked, setPicked] = useState(() => new Set());
  const [soldOut, setSoldOut] = useState(false);
  const [prices, setPrices] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const everyone = useMemo(() => shareableItems(items, { includeSoldOut: soldOut }), [items, soldOut]);
  const sections = useMemo(() => sectionCounts(everyone), [everyone]);
  const chosen = useMemo(() => shareableItems(items, { sections: [...picked], includeSoldOut: soldOut }), [items, picked, soldOut]);

  const name = preview.data?.shop?.name ?? "";
  const slug = shop.slug || preview.data?.shop?.slug || "";
  const slugOk = isValidSlug(slug);
  const message = useMemo(() => (slugOk ? catalogueMessage({ name, slug, items: chosen, prices, site: SITE }) : ""), [name, slug, slugOk, chosen, prices]);
  const none = chosen.length === 0;

  const toggle = (section) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    return next;
  });

  const copy = async () => {
    setNote((await copyText(message)) ? "Message copied. Paste it into any chat." : "Could not copy. Select the text and copy it.");
  };

  const download = async () => {
    setError("");
    setNote("");
    setBusy({ done: 0, total: 0 });
    try {
      const shopInfo = preview.data?.shop;
      await makePdf(
        { shop: { name: shopInfo?.name ?? name, slug, planKey: shopInfo?.planKey ?? shop.planKey, logoUrl: shopInfo ? mediaUrl(shopInfo.logoPath) : null }, items: chosen, prices, site: SITE, cloudName: CLOUD, supabaseUrl: SUPABASE, onProgress: (done, total) => setBusy({ done, total }) },
        catalogueFileName(slug)
      );
      setNote("Your catalogue was downloaded.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share your catalogue" labelId="share-title" wide>
      <div className={share.body}>
        <section className={share.card} aria-labelledby="share-what">
          <h3 id="share-what">What to share</h3>
          <p className={share.count} aria-live="polite" data-testid="share-count">
            {none ? "Nothing to share yet." : `${plural(chosen.length, "item", "items")} ${picked.size ? "in the chosen sections" : "showing to customers"}.`}
          </p>
          {sections.length > 1 && (
            <fieldset className={share.sections}>
              <legend>Sections <span className={share.hint}>(none ticked means all)</span></legend>
              <div className={share.chips}>
                {sections.map((s) => (
                  <label key={s.name || "none"} className={share.chip} data-on={picked.has(s.name) ? "" : undefined}>
                    <input type="checkbox" checked={picked.has(s.name)} onChange={() => toggle(s.name)} />
                    <span>{s.name || "No section"}</span>
                    <span className={share.chipCount}>{s.count}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className={share.option}><input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> Show prices</label>
          <label className={share.option}><input type="checkbox" checked={soldOut} onChange={(e) => setSoldOut(e.target.checked)} /> Include sold-out items</label>
          {!shop.live && <p className={share.warn} role="note">Your shop is not live, so customers cannot open the link yet.</p>}
          {!slugOk && <p className={share.warn} role="alert">Your shop link is not ready. Open Settings to check it.</p>}
        </section>

        <section className={share.card} aria-labelledby="share-wa">
          <h3 id="share-wa"><FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" /> WhatsApp</h3>
          <p className={share.lead}>Send this to a customer, a group or your status. The link opens your shop with photos and prices.</p>
          <div className={share.bubble} data-testid="share-message" aria-label="Message preview" role="group">{message || "Your message appears here."}</div>
          <div className={share.actions}>
            <a className={`${styles.primary} ${share.btn}`} href={message ? catalogueWhatsappUrl(message) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!message}>
              <FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" /> Open WhatsApp
            </a>
            <button type="button" className={`${styles.ghost} ${share.btn}`} onClick={copy} disabled={!message}>
              <FontAwesomeIcon icon={faCopy} aria-hidden="true" /> Copy message
            </button>
          </div>
        </section>

        <section className={share.card} aria-labelledby="share-pdf">
          <h3 id="share-pdf"><FontAwesomeIcon icon={faFilePdf} aria-hidden="true" /> PDF catalogue</h3>
          <p className={share.lead}>A branded catalogue with your photos, section headings and a QR code to your shop. Good for printing or sending as a file.</p>
          {chosen.length > PDF_MAX_ITEMS && <p className={share.warn} role="note">The PDF holds the first {PDF_MAX_ITEMS} items. Tick a section to share the rest.</p>}
          <div className={share.actions}>
            <button type="button" className={`${styles.primary} ${share.btn}`} onClick={download} disabled={none || !slugOk || busy !== null || preview.isLoading}>
              <FontAwesomeIcon icon={faFilePdf} aria-hidden="true" /> {busy ? (busy.total ? `Loading photos ${busy.done} of ${busy.total}` : "Preparing") : "Download PDF"}
            </button>
          </div>
        </section>

        <p className={share.status} role="status" aria-live="polite">{note && <><FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {note}</>}</p>
        {error && <p className={share.warn} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
