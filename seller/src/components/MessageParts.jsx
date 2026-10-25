import { useRef, useState } from "react";
import { PROOF_ACCEPT, PROOF_MAX_FILES, checkProofBatch } from "@epicmkt/shared";
import { formatDateTime } from "@epicmkt/shared/billing";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import ui from "../styles/ui.module.css";
import Ticks from "./Ticks.jsx";
import styles from "./messageParts.module.css";

const TYPE_LABEL = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };
export const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Files that came with a message. A short lived link is made when the seller clicks Open. */
export function AttachmentList({ files }) {
  const [error, setError] = useState("");
  if (!files?.length) return null;
  const open = async (file) => {
    setError("");
    try {
      window.open(await api.openAttachment(file.path), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div>
      <ul className={styles.files} aria-label="Attachments">
        {files.map((f) => (
          <li key={f.id} className={styles.file}>
            <span>{f.name} · {TYPE_LABEL[f.mime] ?? "File"} · {sizeText(f.size)}</span>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => open(f)} aria-label={`Open ${f.name}`}>Open</button>
          </li>
        ))}
      </ul>
      {error && <p className={ui.error} role="alert">{error}</p>}
    </div>
  );
}

/** One message in a conversation. Replies sit further in, so nested replies stay readable. */
export function MessageBubble({ m, receipt }) {
  const mine = m.sender === "seller";
  return (
    <li className={styles.bubble} data-mine={mine} data-testid="thread-message" data-sender={m.sender} style={{ marginInlineStart: `${Math.min(m.depth ?? 0, 4) * 1.25}rem` }}>
      <div className={styles.who}>
        <strong>{mine ? "You" : "EpicMKT"}</strong>
        <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
        {mine && <Ticks state={receipt} />}
      </div>
      <p className={styles.body}>{m.body}</p>
      <AttachmentList files={m.attachments} />
    </li>
  );
}

/** Reply text and up to 3 files. onSend({ body, files }) sends it. */
export function ReplyBox({ id, onSend, label = "Your reply" }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const pick = (e) => {
    const next = [...files, ...Array.from(e.target.files ?? [])];
    e.target.value = "";
    const check = checkProofBatch(next);
    if (check.error) return setError(`${errorText({ code: check.error })}${check.file ? ` (${check.file})` : ""}`);
    setError("");
    setFiles(next);
  };
  const send = async (e) => {
    e.preventDefault();
    setError("");
    if (!text.trim() && !files.length) return setError(errorText({ code: "reply_too_short" }));
    setBusy(true);
    try {
      await onSend({ body: text.trim(), files });
      setText("");
      setFiles([]);
    } catch (err) {
      setError(`${errorText(err)}${err.file ? ` (${err.file})` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} noValidate className={`${ui.field} ${styles.reply}`}>
      <label className={ui.label} htmlFor={`msg-${id}`}>{label}</label>
      <textarea id={`msg-${id}`} className={ui.input} value={text} rows={3} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-invalid={error ? true : undefined} />
      <div>
        <input ref={input} type="file" accept={PROOF_ACCEPT} multiple hidden onChange={pick} data-testid={`msg-file-${id}`} />
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => input.current?.click()} disabled={busy || files.length >= PROOF_MAX_FILES}>Attach a file (JPG, PNG, WebP or PDF, up to 8 MB)</button>
      </div>
      {files.length > 0 && (
        <ul className={styles.files} aria-label="Files to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={styles.file}>
              <span>{f.name} · {sizeText(f.size)}</span>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className={ui.error} role="alert">{error}</p>}
      <button type="submit" className={ui.btn} disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Sending" : "Send reply"}</button>
    </form>
  );
}
