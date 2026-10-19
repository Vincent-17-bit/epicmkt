import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROOF_ACCEPT, PROOF_MAX_FILES, checkProofBatch, groupThreads, receiptOf } from "@epicmkt/shared";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import Ticks from "../components/Ticks.jsx";
import { useToast } from "../components/Toast.jsx";

const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const TYPE = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };
const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
export const MESSAGES_KEY = ["admin-messages"];
export const UNREAD_KEY = ["admin-unread-messages"];

function Files({ files }) {
  const toast = useToast();
  if (!files?.length) return null;
  const open = async (file) => {
    try {
      window.open(await api.openMessageFile(file.path), "_blank", "noopener,noreferrer");
    } catch (failure) {
      toast.push({ message: failure.message, tone: "error" });
    }
  };
  return (
    <ul className="msg-files" aria-label="Attachments">
      {files.map((f) => (
        <li key={f.id}>
          <span>{f.name} · {TYPE[f.mime] ?? "File"} · {size(f.size)}</span>
          <Button size="sm" onClick={() => open(f)} aria-label={`Open ${f.name}`}>Open</Button>
        </li>
      ))}
    </ul>
  );
}

function Compose({ label, askReply = true, onSend, busy }) {
  const [body, setBody] = useState("");
  const [needsReply, setNeedsReply] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const picker = useRef(null);

  const pick = (event) => {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    event.target.value = "";
    const check = checkProofBatch(next);
    if (check.error) return setError(check.error === "attachments_limit" ? "You can attach up to 3 files." : check.error === "file_too_large" ? `${check.file} is over 8 MB.` : `${check.file} must be a JPG, PNG, WebP or PDF.`);
    setError("");
    setFiles(next);
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim() && !files.length) return setError("Write a message or attach a file.");
    setError("");
    try {
      await onSend({ body: body.trim(), needsReply, files });
      setBody("");
      setFiles([]);
      setNeedsReply(false);
    } catch (failure) {
      setError(failure.message);
    }
  };

  return (
    <form className="msg-compose" onSubmit={submit} noValidate>
      <label className="field">
        {label}
        <textarea value={body} rows={3} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
      </label>
      {askReply ? (
        <label className="filters__check">
          <input type="checkbox" checked={needsReply} onChange={(event) => setNeedsReply(event.target.checked)} />
          Ask the seller to reply
        </label>
      ) : null}
      <div className="msg-compose__row">
        <input ref={picker} type="file" accept={PROOF_ACCEPT} multiple hidden onChange={pick} aria-label="Attach files" />
        <Button onClick={() => picker.current?.click()} disabled={busy || files.length >= PROOF_MAX_FILES}>Attach a file</Button>
        {files.map((f, index) => (
          <span key={`${f.name}-${index}`} className="msg-chip">
            {f.name}
            <button type="button" className="link-button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${f.name}`}>Remove</button>
          </span>
        ))}
      </div>
      {error ? <p className="modal__error" role="alert">{error}</p> : null}
      <Button type="submit" variant="primary" disabled={busy}>{busy ? "Sending" : "Send"}</Button>
    </form>
  );
}

function Bubble({ m }) {
  const mine = m.sender === "admin";
  const unread = m.sender === "seller" && !m.adminReadAt;
  return (
    <li className="msg-bubble" data-mine={mine} data-unread={unread} data-testid="thread-message" data-sender={m.sender} style={{ marginInlineStart: `${Math.min(m.depth, 4) * 1.25}rem` }}>
      <div className="msg-bubble__who">
        <strong>{mine ? "EpicMKT" : m.businessName}</strong>
        <time dateTime={m.createdAt}>{stamp(m.createdAt)}</time>
        {mine ? <Ticks state={receiptOf(m)} /> : unread ? <span className="status-pill">New</span> : null}
        {mine && m.needsReply ? <span className="status-pill">Reply requested</span> : null}
      </div>
      <p className="msg-bubble__body">{m.body}</p>
      <Files files={m.attachments} />
    </li>
  );
}

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const selected = params.get("business");

  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: MESSAGES_KEY, queryFn: () => api.listMessages(), refetchInterval: 30_000 });

  const businesses = useMemo(() => {
    const map = new Map();
    for (const m of data) {
      if (!map.has(m.businessId)) map.set(m.businessId, { id: m.businessId, name: m.businessName, sellerId: m.sellerId, messages: [] });
      map.get(m.businessId).messages.push(m);
    }
    return [...map.values()]
      .map((b) => {
        const threads = groupThreads(b.messages);
        return {
          ...b, threads, unread: b.messages.filter((m) => m.sender === "seller" && !m.adminReadAt).length,
          last: threads[0]?.last, waiting: threads.some((t) => t.needsReply && t.last.sender === "admin"),
        };
      })
      .sort((a, b) => (a.last?.createdAt < b.last?.createdAt ? 1 : -1));
  }, [data]);

  const current = businesses.find((b) => b.id === selected) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
  };

  // Opening the page gives the seller's device two green ticks; opening a business turns its messages blue.
  useEffect(() => { api.ackMessagesDelivered().then(refresh).catch(() => {}); }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadHere = current?.unread ?? 0;
  useEffect(() => {
    if (current && unreadHere) api.markMessagesRead({ businessId: current.id }).then(refresh).catch(() => {});
  }, [current?.id, unreadHere]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: (input) => api.sendMessage(input),
    onSuccess: () => { toast.push({ message: "Sent" }); refresh(); },
  });

  return (
    <div className="page-shell">
      <div className="msg-layout">
        <section className="panel msg-list" aria-label="Conversations">
          <div className="panel__header"><h3>Conversations</h3></div>
          {isLoading ? <p role="status">Loading</p> : null}
          {isError ? <p role="alert">Could not load messages. <Button size="sm" onClick={() => refetch()}>Try again</Button></p> : null}
          {!isLoading && !isError && businesses.length === 0 ? (
            <p className="muted" data-testid="empty">No conversations yet. Select businesses on the Businesses page and choose Message to start one.</p>
          ) : null}
          <ul>
            {businesses.map((b) => (
              <li key={b.id}>
                <button type="button" className="msg-list__item" data-active={b.id === selected} data-testid="conversation-row" onClick={() => setParams({ business: b.id })}>
                  <span className="msg-list__name">{b.name}</span>
                  <span className="msg-list__sub">{b.last?.subject} · {b.last ? stamp(b.last.createdAt) : ""}</span>
                  {b.unread ? <span className="admin-nav-item__badge" title={`${b.unread} unread`}>{b.unread}<span className="sr-only"> unread</span></span> : null}
                  {b.waiting && !b.unread ? <span className="status-pill">Waiting for reply</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel msg-thread" aria-label="Messages">
          {!current ? (
            <p className="muted">Choose a conversation.</p>
          ) : (
            <>
              <div className="panel__header"><h3>{current.name}</h3><span className="muted">{current.sellerId}</span></div>
              {current.threads.map((t) => (
                <article key={t.id} className="msg-thread__item" data-testid="thread">
                  <h4>{t.subject}</h4>
                  <ul className="msg-bubbles">{t.messages.map((m) => <Bubble key={m.id} m={m} />)}</ul>
                  <Compose label="Reply" busy={send.isPending} onSend={(input) => send.mutateAsync({ parentId: t.last.id, ...input })} />
                </article>
              ))}
              <article className="msg-thread__item">
                <h4>New message</h4>
                <Compose label="Message" busy={send.isPending} onSend={(input) => send.mutateAsync({ businessId: current.id, subject: null, ...input })} />
              </article>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
