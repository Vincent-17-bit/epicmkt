import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Pager from "../../components/Pager.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { reportReasonLabel } from "../../lib/moderation.js";
import { stampDay } from "../../lib/time.js";

const PAGE_SIZE = 25;
const STATUSES = [["open", "Open"], ["reviewed", "Reviewed"], ["dismissed", "Dismissed"], ["all", "All"]];
const stamp = stampDay;

export default function ReportsTab() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-moderation", "reports", status, search, page],
    queryFn: () => api.listReports({ status, search, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const change = useMutation({
    mutationFn: ({ id, next }) => api.setReportStatus({ id, status: next }),
    onSuccess: () => {
      toast.push({ message: "Report updated." });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation"] });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-counts"] });
    },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
  });

  const rows = data?.rows ?? [];
  const locked = !can("moderation.resolve") || change.isPending;
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

      {isError ? <LoadError what="reports" error={error} onRetry={refetch} /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Business</th><th>Item</th><th>Reason</th><th>Reported</th><th>Status</th><th /></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                : rows.length === 0 ? <tr><td colSpan={6}>No reports here.</td></tr>
                : rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link>
                      {row.open_for_business > 1 ? <div className="muted">{row.open_for_business} open reports</div> : null}
                    </td>
                    <td>{row.item_name ?? "Whole business"}</td>
                    <td><strong>{reportReasonLabel(row.reason)}</strong>{row.details ? <div className="muted">{row.details}</div> : null}</td>
                    <td>{stamp(row.created_at)}</td>
                    <td><span className={`status-pill ${row.status === "open" ? "status-pill--degraded" : "status-pill--neutral"}`}>{row.status}</span></td>
                    <td className="row-actions">
                      {row.status === "open" ? (
                        <>
                          <Button size="sm" disabled={locked} title={why("moderation.resolve")} onClick={() => change.mutate({ id: row.id, next: "reviewed" })} aria-label={`Mark report on ${row.business_name} reviewed`}>Reviewed</Button>
                          <Button size="sm" disabled={locked} title={why("moderation.resolve")} onClick={() => change.mutate({ id: row.id, next: "dismissed" })} aria-label={`Dismiss report on ${row.business_name}`}>Dismiss</Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={locked} title={why("moderation.resolve")} onClick={() => change.mutate({ id: row.id, next: "open" })} aria-label={`Reopen report on ${row.business_name}`}>Reopen</Button>
                      )}
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
