import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Pager from "../../components/Pager.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { ago } from "../../lib/messaging.js";
import MessageDetail from "./MessageDetail.jsx";
import PendingBroadcasts from "./PendingBroadcasts.jsx";

const PAGE_SIZE = 25;
const CHANNELS = [["all", "All channels"], ["sms", "SMS"], ["email", "Email"], ["in_app", "In-app"]];
const STATUSES = [["all", "Any status"], ["queued", "Queued"], ["sent", "Sent"], ["delivered", "Delivered"], ["failed", "Failed"], ["cancelled", "Cancelled"]];
const tone = { failed: "down", queued: "degraded", sent: "healthy", delivered: "healthy", cancelled: "neutral" };

export default function LogTab() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-message-log", channel, status, search, page],
    queryFn: () => api.listMessageLog({ channel, status, search, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
  const { data: summary } = useQuery({ queryKey: ["admin-message-summary"], queryFn: () => api.getMessageSummary({ days: 7 }), refetchInterval: 30_000 });

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["admin-message-log"] }); queryClient.invalidateQueries({ queryKey: ["admin-message-summary"] }); };
  const retry = useMutation({
    mutationFn: (id) => api.retryMessage(id),
    onSuccess: () => { toast.push({ message: "Back in the queue." }); refresh(); },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
  });
  const retryAll = useMutation({
    mutationFn: () => api.retryFailedMessages({ days: 7 }),
    onSuccess: (n) => { toast.push({ message: n ? `${n} failed ${n === 1 ? "message" : "messages"} back in the queue.` : "Nothing to retry." }); refresh(); },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
  });

  const rows = data?.rows ?? [];
  const canRetry = can("messages.send");
  const by = summary?.by_status ?? {};
  return (
    <div>
      <PendingBroadcasts />
      {summary && (
        <p className="log-summary">
          Last {summary.days} days: <strong>{(by.sent ?? 0) + (by.delivered ?? 0)}</strong> sent, <strong>{by.queued ?? 0}</strong> queued, <strong className={by.failed ? "text-danger" : ""}>{by.failed ?? 0}</strong> failed. SMS cost KES {Number(summary.cost_kes).toLocaleString("en-KE", { maximumFractionDigits: 2 })}.
          {by.failed > 0 && <> <Button size="sm" disabled={!canRetry || retryAll.isPending} title={why("messages.send")} onClick={() => retryAll.mutate()}>Retry all failed</Button></>}
        </p>
      )}
      <div className="toolbar">
        <label className="field">Channel<select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(0); }}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Search<input type="search" value={search} placeholder="Business, address, subject" onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
      </div>
      {isError ? <LoadError what="the message log" error={error} onRetry={refetch} /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Message</th><th scope="col">Channel</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                : rows.length === 0 ? <tr><td colSpan={6}>No messages match.</td></tr>
                : rows.map((row) => (
                  <tr key={row.id}>
                    <td>{ago(row.created_at)}</td>
                    <td>{row.business_id ? <Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link> : row.application_name ?? "Applicant"}<div className="muted">{row.business_id ? null : "Applicant · "}{row.to_address ?? "In-app"}</div></td>
                    <td><strong>{row.subject}</strong>{row.template_key ? <div className="muted">Template: {row.template_key}</div> : null}</td>
                    <td>{row.channel === "in_app" ? "In-app" : row.channel.toUpperCase()}</td>
                    <td>
                      <span className={`status-pill status-pill--${tone[row.status] ?? "neutral"}`}>{row.status}</span>
                      {row.status === "failed" ? <div className="muted">{row.error ?? "send_failed"} after {row.attempts} {row.attempts === 1 ? "try" : "tries"}</div> : null}
                      {row.status === "queued" && Date.parse(row.scheduled_at) > Date.now() ? <div className="muted">Scheduled</div> : null}
                    </td>
                    <td>
                      <Button size="sm" onClick={() => setOpenId(row.id)} aria-label={`View message ${row.subject}`}>View</Button>
                      {row.status === "failed" && <Button size="sm" disabled={!canRetry || retry.isPending} title={why("messages.send")} onClick={() => retry.mutate(row.id)} aria-label={`Retry message to ${row.business_name ?? row.application_name ?? "applicant"}`}>Retry</Button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      {openId ? <MessageDetail id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
