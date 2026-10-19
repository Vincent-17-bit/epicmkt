import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@epicmkt/shared/billing";
import { receiptOf } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { BELL_KEY } from "../../components/Layout.jsx";
import { AttachmentList } from "../../components/MessageParts.jsx";
import Ticks from "../../components/Ticks.jsx";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import ui from "../../styles/ui.module.css";
import styles from "./notifications.module.css";

export const FILTERS = [
  { id: "all", label: "All", kinds: null },
  { id: "billing", label: "Billing", kinds: ["payment", "reminder", "grace", "expiry"] },
  { id: "approval", label: "Approvals", kinds: ["approval"] },
  { id: "change", label: "Change requests", kinds: ["change"] },
  { id: "removal", label: "Removals", kinds: ["removal"] },
  { id: "strike", label: "Strikes", kinds: ["strike"] },
  { id: "report", label: "Customer reports", kinds: ["report"] },
  { id: "question", label: "Questions", kinds: ["question"] },
  { id: "message", label: "Messages", kinds: ["general"] },
];

const KIND_LABEL = { approval: "Approval", reminder: "Reminder", grace: "Grace", expiry: "Expired", change: "Change request", removal: "Removal", strike: "Strike", report: "Customer report", payment: "Payment", question: "Question", general: "Message" };

export default function Notifications() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const f = FILTERS.find((x) => x.id === filter);
  const list = useQuery({ queryKey: ["messages", filter], queryFn: () => api.listMessages({ kinds: f.kinds }) });
  const unread = useQuery({ queryKey: BELL_KEY, queryFn: api.unreadCount });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["messages"] });
    qc.invalidateQueries({ queryKey: BELL_KEY });
  };
  useRealtime(["messages"], refresh);
  const mark = useMutation({ mutationFn: (ids) => api.markRead(ids), onSuccess: refresh });

  const items = list.data ?? [];
  return (
    <div className={ui.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1>Notifications</h1>
          <p className={ui.muted} aria-live="polite" data-testid="unread-summary">{(unread.data ?? 0) === 0 ? "You are all caught up." : `${unread.data} unread`}</p>
        </div>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={(unread.data ?? 0) === 0 || mark.isPending} onClick={() => mark.mutate(null)}>Mark all read</button>
      </div>

      <div className={ui.chips} role="group" aria-label="Filter by type">
        {FILTERS.map((x) => (
          <button key={x.id} type="button" className={ui.chip} aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>{x.label}</button>
        ))}
      </div>

      {mark.error && <p className={ui.error} role="alert">{errorText(mark.error)}</p>}
      {list.isLoading ? (
        <p role="status">Loading</p>
      ) : list.error ? (
        <p className={ui.error} role="alert">We could not load your notifications.</p>
      ) : items.length === 0 ? (
        <p className={ui.muted} data-testid="empty">Nothing here yet.</p>
      ) : (
        <ul className={styles.list} aria-label="Notifications">
          {items.map((m) => (
            <li key={m.id} className={styles.item} data-unread={!m.readAt} data-testid="notification" data-kind={m.kind}>
              <div className={styles.meta}>
                <span className={`${ui.pill} ${ui.tone_info}`}>{KIND_LABEL[m.kind] ?? m.kind}</span>
                <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                {!m.readAt && <span className={ui.srOnly}>Unread</span>}
              </div>
              <h2>{m.subject}</h2>
              <p>{m.body}</p>
              <AttachmentList files={m.attachments} />
              <div className={styles.meta}>
                {m.sender === "seller" && <Ticks state={receiptOf(m)} />}
                {m.sender === "admin" && m.needsReply && <Link className={ui.link} to={`/business/questions#thread-${m.threadId}`}>Reply to EpicMKT</Link>}
                {m.kind === "question" && <Link className={ui.link} to="/business/questions">Answer this question</Link>}
                {["payment", "reminder", "grace", "expiry"].includes(m.kind) && <Link className={ui.link} to="/business/subscription">Open subscription</Link>}
                {!m.readAt && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={mark.isPending} onClick={() => mark.mutate([m.id])} aria-label={`Mark "${m.subject}" as read`}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
