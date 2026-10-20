import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Modal from "../components/Modal.jsx";
import LoadError from "../components/LoadError.jsx";
import Pager from "../components/Pager.jsx";
import { useToast } from "../components/Toast.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import { changeCost, changeFieldLabel, changeValue } from "../lib/moderation.js";

const PAGE_SIZE = 25;
const STATUSES = [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]];
const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }).format(new Date(iso));

function ApproveDialog({ row, busy, error, onConfirm, onCancel }) {
  const cost = changeCost(row);
  return (
    <Modal title={`Approve ${changeFieldLabel(row.field).toLowerCase()} change`} onClose={busy ? () => {} : onCancel}>
      <div className="modal__form">
        <p className="modal__summary">
          {row.business_name}: {changeValue(row, "old")} becomes <strong>{changeValue(row, "new")}</strong>. It goes live on their listing straight away and the seller is told.
        </p>
        {cost ? <p>{cost}</p> : null}
        {error ? <p className="modal__error" role="alert">{error}</p> : null}
        <div className="modal__footer">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>{busy ? "Working" : "Approve"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ApprovalsPage() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(0);
  const [approve, setApprove] = useState(null);
  const [reject, setReject] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-approvals", status, page],
    queryFn: () => api.listChangeRequests({ status, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const decide = useMutation({
    mutationFn: ({ id, approve: yes, note }) => api.decideChangeRequest({ id, approve: yes, note }),
    onSuccess: (_, vars) => {
      toast.push({ message: vars.approve ? "Change approved and applied." : "Change rejected. The seller has been told why." });
      setApprove(null);
      setReject(null);
      queryClient.invalidateQueries({ queryKey: ["admin-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-counts"] });
    },
  });

  const rows = data?.rows ?? [];
  const locked = !can("approvals.decide");
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Approvals</h3>
          <label className="field">Status
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <p className="muted">Changes sellers cannot make themselves: name, category, phone, town, KRA PIN and licence.</p>

        {isError ? <LoadError what="change requests" error={error} onRetry={refetch} /> : (
          <div className="table-shell">
            <table>
              <thead><tr><th>Business</th><th>Change</th><th>From</th><th>To</th><th>Asked</th><th>Status</th><th /></tr></thead>
              <tbody>
                {isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                  : rows.length === 0 ? <tr><td colSpan={7}>{status === "pending" ? "Nothing is waiting for approval." : "No change requests here."}</td></tr>
                  : rows.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link></td>
                      <td>{changeFieldLabel(row.field)}{changeCost(row) ? <div className="muted">{changeCost(row)}</div> : null}</td>
                      <td>{changeValue(row, "old")}</td>
                      <td><strong>{changeValue(row, "new")}</strong></td>
                      <td>{stamp(row.created_at)}</td>
                      <td>
                        <span className={`status-pill ${row.status === "pending" ? "status-pill--degraded" : row.status === "approved" ? "status-pill--healthy" : "status-pill--neutral"}`}>{row.status}</span>
                        {row.admin_note ? <div className="muted">{row.admin_note}</div> : null}
                      </td>
                      <td className="row-actions">
                        {row.status === "pending" && (
                          <>
                            <Button size="sm" variant="primary" disabled={locked} title={why("approvals.decide")} onClick={() => { decide.reset(); setApprove(row); }} aria-label={`Approve ${changeFieldLabel(row.field)} change for ${row.business_name}`}>Approve</Button>
                            <Button size="sm" disabled={locked} title={why("approvals.decide")} onClick={() => { decide.reset(); setReject(row); }} aria-label={`Reject ${changeFieldLabel(row.field)} change for ${row.business_name}`}>Reject</Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      </section>

      {approve && (
        <ApproveDialog row={approve} busy={decide.isPending} error={decide.isError ? decide.error.message : ""}
          onConfirm={() => decide.mutate({ id: approve.id, approve: true })} onCancel={() => setApprove(null)} />
      )}
      {reject && (
        <ConfirmDialog
          title={`Reject ${changeFieldLabel(reject.field).toLowerCase()} change`}
          summary={`${reject.business_name} keeps ${changeValue(reject, "old")}. The reason below is sent to the seller.`}
          confirmLabel="Reject"
          danger
          busy={decide.isPending}
          error={decide.isError ? decide.error.message : ""}
          onConfirm={(note) => decide.mutate({ id: reject.id, approve: false, note })}
          onCancel={() => setReject(null)}
        />
      )}
    </div>
  );
}
