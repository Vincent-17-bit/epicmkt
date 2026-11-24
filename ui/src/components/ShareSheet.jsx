import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faEllipsis, faLink, faXmark } from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faWhatsapp, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { shareTargets } from "@epicmkt/shared";
import Modal from "./Modal.jsx";
import styles from "./ShareSheet.module.css";

export const SHARE_LABELS = {
  title: "Share",
  close: "Close",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  x: "X",
  copy: "Copy link",
  copied: "Link copied",
  copyFailed: "Could not copy. Select the link and copy it.",
  more: "More options",
};

const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareSheet({ open, onClose, url, title = "", text = "", labels = {}, onShared }) {
  const l = { ...SHARE_LABELS, ...labels };
  const [note, setNote] = useState("");
  const timer = useRef(null);
  const used = useRef(false);
  if (open) used.current = true;

  useEffect(() => {
    if (!open) setNote("");
    return undefined;
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  let targets = null;
  try {
    targets = open && url ? shareTargets({ url, text: text || title }) : null;
  } catch {
    targets = null;
  }

  const say = (message) => {
    setNote(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(""), 2500);
  };

  const copy = async () => {
    const ok = await writeClipboard(url);
    say(ok ? l.copied : l.copyFailed);
    if (ok) onShared?.("copy");
  };

  const more = async () => {
    try {
      await navigator.share({ title, text: text || title, url });
      onShared?.("native");
      onClose();
    } catch (err) {
      if (err?.name !== "AbortError") say(l.copyFailed);
    }
  };

  const opened = (channel) => () => onShared?.(channel);

  if (!used.current) return null;

  return (
    <Modal open={open} onClose={onClose} labelledBy="share-sheet-title" variant="sheet" className={styles.dialog}>
      <div className={styles.body}>
        <header className={styles.head}>
          <h2 id="share-sheet-title" className={styles.title}>{l.title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={l.close}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.preview}>
          {title && <strong className={styles.name}>{title}</strong>}
          <span className={styles.url}>{url}</span>
        </div>

        {targets && (
          <ul className={styles.grid}>
            <li>
              <a className={styles.tile} data-channel="whatsapp" href={targets.whatsapp} target="_blank" rel="noopener noreferrer" onClick={opened("whatsapp")}>
                <span className={styles.badge}><FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" /></span>
                <span className={styles.label}>{l.whatsapp}</span>
              </a>
            </li>
            <li>
              <a className={styles.tile} data-channel="facebook" href={targets.facebook} target="_blank" rel="noopener noreferrer" onClick={opened("facebook")}>
                <span className={styles.badge}><FontAwesomeIcon icon={faFacebookF} aria-hidden="true" /></span>
                <span className={styles.label}>{l.facebook}</span>
              </a>
            </li>
            <li>
              <a className={styles.tile} data-channel="x" href={targets.x} target="_blank" rel="noopener noreferrer" onClick={opened("x")}>
                <span className={styles.badge}><FontAwesomeIcon icon={faXTwitter} aria-hidden="true" /></span>
                <span className={styles.label}>{l.x}</span>
              </a>
            </li>
            <li>
              <button type="button" className={styles.tile} data-channel="copy" onClick={copy}>
                <span className={styles.badge}><FontAwesomeIcon icon={note === l.copied ? faCheck : faLink} aria-hidden="true" /></span>
                <span className={styles.label}>{l.copy}</span>
              </button>
            </li>
          </ul>
        )}

        {canNativeShare() && (
          <button type="button" className={styles.more} onClick={more}>
            <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" /> {l.more}
          </button>
        )}

        <p className={styles.note} role="status" aria-live="polite">{note}</p>
      </div>
    </Modal>
  );
}
