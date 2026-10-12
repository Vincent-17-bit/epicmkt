import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROOF_ACCEPT, PROOF_MAX_FILES, REPLY_MAX, REPLY_MIN, checkProofBatch, checkReply } from "@epicmkt/shared";
import { formatDateTime } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { now } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import ui from "../../styles/ui.module.css";
import styles from "./questions.module.css";

export const STATUS = {
  open: { label: "Open", tone: "tone_warning" },
  replied: { label: "Answered", tone: "tone_ok" },
  resolved: { label: "Closed", tone: "tone_info" },
};

const TYPE_LABEL = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };

export const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Names, types and sizes only. Sellers never download proofs, so there is no link here.
function FileList({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <ul className={styles.files} aria-label="Files">
      {files.map((f, i) => (
        <li key={f.id ?? `${f.name}-${i}`} className={styles.file}>
          <span>{f.name} · {TYPE_LABEL[f.mime ?? f.type] ?? "File"} · {formatSize(f.size)}</span>
          {onRemove && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`}>Remove</button>}
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({ q, onDone }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const len = text.trim().length;
  const bad = len > REPLY_MAX;

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
    const problem = checkReply(text);
    if (problem) return setError(errorText({ code: problem }));
    setBusy(true);
    try {
      if (files.length) await api.uploadProofs(q.id, files);
      await api.replyFlag(q.id, text.trim());
      setText("");
      setFiles([]);
      await onDone();
    } catch (err) {
      setError(`${errorText(err)}${err.file ? ` (${err.file})` : ""}`);
      // A rejected file means nothing was kept on our side: start the file choice again.
      if (["type_not_allowed", "type_mismatch", "file_too_large", "pdf_encrypted", "pdf_active_content", "file_not_uploaded", "file_empty"].includes(err.code)) setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} noValidate className={ui.field}>
      <label className={ui.label} htmlFor={`reply-${q.id}`}>Your reply</label>
      <textarea
        id={`reply-${q.id}`} className={ui.input} value={text} onChange={(e) => setText(e.target.value)} rows={4}
        aria-invalid={error ? true : undefined} aria-describedby={`count-${q.id}${error ? ` err-${q.id}` : ""}`}
      />
      <span id={`count-${q.id}`} className={styles.count} data-bad={bad} aria-live="polite">{len} / {REPLY_MAX} characters (at least {REPLY_MIN})</span>
      <div>
        <input ref={input} id={`file-${q.id}`} type="file" accept={PROOF_ACCEPT} multiple hidden onChange={pick} />
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => input.current?.click()} disabled={files.length >= PROOF_MAX_FILES || busy}>Add proof (JPG, PNG, WebP or PDF, up to 8 MB)</button>
      </div>
      <FileList files={files} onRemove={(i) => setFiles(files.filter((_, k) => k !== i))} />
      {error && <p id={`err-${q.id}`} className={ui.error} role="alert">{error}</p>}
      <button type="submit" className={ui.btn} disabled={busy} style={{ justifySelf: "start" }}>{busy ? (files.length ? "Checking files" : "Sending") : "Send reply"}</button>
    </form>
  );
}

export default function Questions() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["questions"], queryFn: api.listQuestions });
  const refresh = () => qc.invalidateQueries({ queryKey: ["questions"] });
  useRealtime(["flags", "flag_attachments"], refresh);

  return (
    <div className={ui.page}>
      <div className={ui.pageHead}>
        <h1>Questions from EpicMKT</h1>
        <p className={ui.muted}>Answer in plain text. You can attach up to 3 proof files. EpicMKT staff can open them; you cannot download them again.</p>
      </div>
      {list.isLoading ? (
        <p role="status">Loading</p>
      ) : list.error ? (
        <p className={ui.error} role="alert">We could not load your questions.</p>
      ) : (list.data ?? []).length === 0 ? (
        <p className={ui.muted} data-testid="empty">No questions right now.</p>
      ) : (
        <ul className={styles.list} aria-label="Questions">
          {list.data.map((q) => {
            const s = STATUS[q.status] ?? STATUS.open;
            const overdue = q.status === "open" && q.dueAt && new Date(q.dueAt) < now();
            return (
              <li key={q.id} className={styles.q} data-testid="question" data-status={q.status}>
                <div className={styles.meta}>
                  <span className={`${ui.pill} ${ui[s.tone]}`}>{s.label}</span>
                  {q.dueAt && <span className={overdue ? styles.overdue : undefined}>{overdue ? "Overdue: " : "Due "}{formatDateTime(q.dueAt)}</span>}
                </div>
                <h2>{q.message}</h2>
                {(q.item || q.faq) && (
                  <p style={{ margin: 0 }} className={styles.meta}>
                    About {q.item ? "item" : "FAQ"}:{" "}
                    {q.item ? <Link className={ui.link} to={`/business/items/${q.item.id}`}>{q.item.name}</Link> : <Link className={ui.link} to={`/business/faqs?focus=${q.faq.id}`}>{q.faq.question}</Link>}
                  </p>
                )}
                {q.reply && <div className={styles.reply} data-testid="reply-text">{q.reply}</div>}
                <FileList files={q.attachments} />
                {q.status === "open" && <ReplyForm q={q} onDone={refresh} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
