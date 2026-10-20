import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Pager from "../../components/Pager.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { dueLabel } from "../../lib/moderation.js";

const PAGE_SIZE = 25;
const STATUSES = [["open", "Open"], ["replied", "Seller replied"], ["resolved", "Resolved"], ["all", "All"]];
const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(iso));

export default function FlagsTab() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-moderation", "flags", status, search, page],
    queryFn: () => api.listFlags({ status, search, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const change = useMutation({
    mutationFn: ({ id, next }) => api.setModerationFlag({ id, status: next }),
    onSuccess: () => {
      toast.push({ message: "Flag updated." });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation"] });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-counts"] });
    },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
  });

  const rows = data?.rows ?? [];
  return (
    <div>
      <div className="toolbar">
        <label className="field">Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">Search
          <input type="search" value={search} placeholder="Business or reason" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </label>
      </div>

      {isError ? <LoadError what="flags" error={error} onRetry={refetch} /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Business</th><th>Item</th><th>Question to seller</th><th>Seller reply</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                : rows.length === 0 ? <tr><td colSpan={7}>No flags here.</td></tr>
                : rows.map((row) => (
                  <tr key={row.id}>
                    <td><Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link></td>
                    <td>{row.item_name ?? "Whole business"}</td>
                    <td><strong>{row.reason}</strong>{row.seller_message ? <div className="muted">{row.seller_message}</div> : null}<div className="muted">Raised {stamp(row.created_at)}</div></td>
                    <td>{row.seller_reply ?? <span className="muted">No reply yet</span>}</td>
                    <td className={row.overdue ? "text-danger" : ""}>{dueLabel(row) || "–"}</td>
                    <td><span className={`status-pill ${row.status === "resolved" ? "status-pill--neutral" : row.status === "replied" ? "status-pill--healthy" : "status-pill--degraded"}`}>{row.status}</span></td>
                    <td>
                      <Button size="sm" disabled={!can("moderation.resolve") || change.isPending} title={why("moderation.resolve")}
                        onClick={() => change.mutate({ id: row.id, next: row.status === "resolved" ? "open" : "resolved" })}
                        aria-label={`${row.status === "resolved" ? "Reopen" : "Resolve"} flag for ${row.business_name}`}>
                        {row.status === "resolved" ? "Reopen" : "Resolve"}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
