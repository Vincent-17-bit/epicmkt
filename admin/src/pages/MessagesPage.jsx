import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip, faPaperPlane, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { usePermissions } from "../hooks/usePermissions.js";
import { PROOF_ACCEPT, PROOF_MAX_FILES, checkProofBatch, groupThreads, receiptOf } from "@epicmkt/shared";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import Modal from "../components/Modal.jsx";
import Ticks from "../components/Ticks.jsx";
import { useToast } from "../components/Toast.jsx";
import { stamp, stampClock } from "../lib/time.js";


const clock = stampClock;
const TYPE = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };
const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
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

function Composer({ threads, busy, onSend }) {
  const { can, why } = usePermissions();
  const [target, setTarget] = useState("");
  const [body, setBody] = useState("");
  const [needsReply, setNeedsReply] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const picker = useRef(null);
  const area = useRef(null);

  const lastId = threads[0]?.id ?? "";
  const valid = target === "new" || threads.some((t) => t.id === target);
  const active = valid ? target : lastId || "new";
  const thread = threads.find((t) => t.id === active) ?? null;

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [body]);

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
      await onSend({ thread, body: body.trim(), needsReply, files });
      setBody("");
      setFiles([]);
      setNeedsReply(false);
    } catch (failure) {
      setError(failure.message);
    }
  };

  const onKey = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
  };

  if (!can("messages.send")) return <p className="muted msg-composer__locked">{why("messages.send")}</p>;

  return (
    <form className="msg-composer" onSubmit={submit} noValidate>
      <div className="msg-composer__top">
        <label className="msg-composer__target">
          <span>Sending to</span>
          <select value={active} onChange={(event) => setTarget(event.target.value)}>
            {threads.map((t) => <option key={t.id} value={t.id}>Reply: {t.subject}</option>)}
            <option value="new">New message</option>
          </select>
        </label>
        <label className="msg-composer__check">
          <input type="checkbox" checked={needsReply} onChange={(event) => setNeedsReply(event.target.checked)} />
          Ask the seller to reply
        </label>
      </div>
      {files.length ? (
        <div className="msg-composer__files">
          {files.map((f, index) => (
            <span key={`${f.name}-${index}`} className="msg-chip">
              {f.name}
              <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${f.name}`}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="msg-composer__row">
        <input ref={picker} type="file" accept={PROOF_ACCEPT} multiple hidden onChange={pick} aria-label="Attach files" />
        <button type="button" className="msg-composer__attach" onClick={() => picker.current?.click()} disabled={busy || files.length >= PROOF_MAX_FILES} aria-label="Attach a file" title="Attach a file">
          <FontAwesomeIcon icon={faPaperclip} />
        </button>
        <textarea ref={area} className="msg-composer__input" value={body} rows={1} maxLength={4000} placeholder="Write a message" aria-label={thread ? "Reply" : "Message"} onChange={(event) => setBody(event.target.value)} onKeyDown={onKey} />
        <button type="submit" className="msg-composer__send" disabled={busy}>
          <FontAwesomeIcon icon={faPaperPlane} />
          <span>{busy ? "Sending" : "Send"}</span>
        </button>
      </div>
      {error ? <p className="modal__error" role="alert">{error}</p> : null}
    </form>
  );
}

function Bubble({ m, onDelete, canDelete, focused }) {
  const mine = m.sender === "admin";
  const unread = m.sender === "seller" && !m.adminReadAt;
  const ref = useRef(null);
  // Arriving from the bell: bring this message into view and move focus to it so a screen reader reads it.
  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, [focused]);
  return (
    <li ref={ref} tabIndex={focused ? -1 : undefined} className="msg-bubble" data-mine={mine} data-unread={unread} data-focused={focused || undefined} data-testid="thread-message" data-sender={m.sender} style={{ marginInlineStart: mine ? undefined : `${Math.min(m.depth, 4) * 0.75}rem` }}>
      <div className="msg-bubble__who">
        <strong>{mine ? "EpicMKT" : m.businessName}</strong>
        <time dateTime={m.createdAt} title={stamp(m.createdAt)}>{clock(m.createdAt)}</time>
        {mine ? <Ticks state={receiptOf(m)} /> : unread ? <span className="status-pill">New</span> : null}
        {mine && m.needsReply ? <span className="status-pill">Reply requested</span> : null}
        {canDelete ? (
          <button type="button" className="msg-icon msg-icon--danger" onClick={() => onDelete(m)} aria-label="Delete message" title="Delete message">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        ) : null}
      </div>
      <p className="msg-bubble__body">{m.body}</p>
      <Files files={m.attachments} />
    </li>
  );
}

function DeleteDialog({ target, busy, error, onConfirm, onCancel }) {
  return (
    <Modal title={target.title} onClose={busy ? () => {} : onCancel}>
      <div className="modal__form">
        <p className="modal__summary">{target.summary}</p>
        {error ? <p className="modal__error" role="alert">{error}</p> : null}
        <div className="modal__footer">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" className="admin-button--danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting" : "Delete"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const selected = params.get("business");
  const focusId = params.get("message");
  const [pending, setPending] = useState(null);
  const streamEnd = useRef(null);
  const canDelete = can("messages.delete");

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
  const flow = useMemo(() => (current ? [...current.threads].reverse() : []), [current]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
  };

  useEffect(() => { api.ackMessagesDelivered().then(refresh).catch(() => {}); }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadHere = current?.unread ?? 0;
  useEffect(() => {
    if (current && unreadHere) api.markMessagesRead({ businessId: current.id }).then(refresh).catch(() => {});
  }, [current?.id, unreadHere]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!focusId) streamEnd.current?.scrollIntoView({ block: "end" }); }, [current?.id, data.length, focusId]);

  const send = useMutation({
    mutationFn: (input) => api.sendMessage(input),
    onSuccess: () => { toast.push({ message: "Sent" }); refresh(); },
  });

  const remove = useMutation({
    mutationFn: (target) => (target.kind === "message" ? api.deleteMessage(target.id) : api.deleteConversation({ businessId: target.businessId })),
    onSuccess: (_, target) => {
      toast.push({ message: target.kind === "message" ? "Message deleted" : "Conversation deleted" });
      if (target.kind === "conversation" && target.businessId === selected) setParams({});
      setPending(null);
      refresh();
    },
  });

  const askMessage = (m) => setPending({ kind: "message", id: m.id, title: "Delete this message?", summary: "It is removed from the admin app. The seller keeps their copy." });
  const askConversation = (b) => setPending({ kind: "conversation", businessId: b.id, title: `Delete the conversation with ${b.name}?`, summary: `All ${b.messages.length} ${b.messages.length === 1 ? "message" : "messages"} are removed from the admin app. The seller keeps their copy.` });

  return (
    <div className="msg-layout">
      <section className="msg-list" aria-label="Conversations">
        <header className="msg-pane__head"><h2 className="heading-sm">Conversations</h2></header>
        <div className="msg-list__scroll">
          {isLoading ? <p role="status" className="msg-empty">Loading</p> : null}
          {isError ? <p role="alert" className="msg-empty">Could not load messages. <Button size="sm" onClick={() => refetch()}>Try again</Button></p> : null}
          {!isLoading && !isError && businesses.length === 0 ? (
            <p className="msg-empty" data-testid="empty">No conversations yet. Select businesses on the Businesses page and choose Message to start one.</p>
          ) : null}
          <ul>
            {businesses.map((b) => (
              <li key={b.id} className="msg-list__row" data-active={b.id === selected}>
                <button type="button" className="msg-list__item" data-active={b.id === selected} data-testid="conversation-row" onClick={() => setParams({ business: b.id })}>
                  <span className="msg-avatar" aria-hidden="true">{initials(b.name)}</span>
                  <span className="msg-list__body">
                    <span className="msg-list__top">
                      <span className="msg-list__name">{b.name}</span>
                      <time className="msg-list__time" dateTime={b.last?.createdAt}>{b.last ? stamp(b.last.createdAt) : ""}</time>
                    </span>
                    <span className="msg-list__sub">{b.last?.subject}</span>
                    {b.waiting && !b.unread ? <span className="status-pill msg-list__wait">Waiting for reply</span> : null}
                  </span>
                  {b.unread ? <span className="msg-badge" title={`${b.unread} unread`}>{b.unread}<span className="sr-only"> unread</span></span> : null}
                </button>
                {canDelete ? (
                  <button type="button" className="msg-icon msg-icon--danger msg-list__delete" onClick={() => askConversation(b)} aria-label={`Delete conversation with ${b.name}`} title="Delete conversation">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="msg-thread" aria-label="Messages">
        {!current ? (
          <p className="msg-empty msg-empty--center">Choose a conversation.</p>
        ) : (
          <>
            <header className="msg-pane__head msg-thread__head">
              <span className="msg-avatar msg-avatar--lg" aria-hidden="true">{initials(current.name)}</span>
              <div className="msg-thread__who">
                <h2 className="heading-sm">{current.name}</h2>
                <span className="muted">{current.sellerId}</span>
              </div>
              {canDelete ? (
                <Button size="sm" className="msg-thread__delete" onClick={() => askConversation(current)} aria-label="Delete conversation">
                  <FontAwesomeIcon icon={faTrash} />
                  <span>Delete conversation</span>
                </Button>
              ) : null}
            </header>
            <div className="msg-stream">
              {flow.map((t) => (
                <article key={t.id} className="msg-topic" data-testid="thread">
                  <h3 className="msg-topic__title">{t.subject}</h3>
                  <ul className="msg-bubbles">{t.messages.map((m) => <Bubble key={m.id} m={m} canDelete={canDelete} onDelete={askMessage} focused={m.id === focusId} />)}</ul>
                </article>
              ))}
              <div ref={streamEnd} />
            </div>
            <Composer
              key={current.id}
              threads={current.threads}
              busy={send.isPending}
              onSend={({ thread, ...input }) => (thread
                ? send.mutateAsync({ parentId: thread.last.id, ...input })
                : send.mutateAsync({ businessId: current.id, subject: null, ...input }))}
            />
          </>
        )}
      </section>

      {pending ? (
        <DeleteDialog target={pending} busy={remove.isPending} error={remove.isError ? remove.error.message : ""} onConfirm={() => remove.mutate(pending)} onCancel={() => { remove.reset(); setPending(null); }} />
      ) : null}
    </div>
  );
}
