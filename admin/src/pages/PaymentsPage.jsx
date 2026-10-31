import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { matchesText } from "../lib/globalSearch.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { api } from "../api/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stampLong } from "../lib/time.js";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorCard from "../components/ErrorCard.jsx";
import { faCircleCheck, faCreditCard } from "@fortawesome/free-solid-svg-icons";

// Payments arrive by themselves: Safaricom tells the pay-callback function, which records the M-Pesa code, the amount
// and the account the payer typed. Nobody types a code here. Three things can need a person:
//   Ready to confirm  a first payment is complete: press Confirm to create the seller
//   Needs assigning   the account did not point to exactly one shop (a typo, or two shops with the same name)
//   Part paid         less than a month was paid; it waits, and the next payment completes it
const STATUS = {
  awaiting_confirmation: { label: "Ready to confirm", tone: "live" },
  needs_assignment: { label: "Needs assigning", tone: "live" },
  part_paid: { label: "Part paid", tone: "neutral" },
  renewed: { label: "Renewed automatically", tone: "healthy" },
  confirmed: { label: "Confirmed", tone: "healthy" },
  ignored: { label: "Ignored", tone: "neutral" },
  submitted: { label: "Needs confirming", tone: "live" },
  rejected: { label: "Rejected", tone: "neutral" },
};
const NEEDS_ACTION = new Set(["awaiting_confirmation", "needs_assignment", "submitted"]);
const NOTE = {
  ambiguous_name: "More than one shop has this name.",
  no_match: "No shop uses this account number.",
  no_account: "The payer left the account number empty.",
  application_rejected: "This application was rejected.",
  application_draft: "This application was never submitted.",
  credit_failed: "A shop matched but the payment could not be applied.",
};

const kes = (n) => `KES ${Number(n ?? 0).toLocaleString("en-KE")}`;
const when = (iso) =>
  iso ? stampLong(iso) : "";
const COLS = 8;

function AssignPanel({ row, onClose, onDone }) {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const found = useQuery({ queryKey: ["pay-targets", q], queryFn: () => api.searchPayTargets(q), enabled: q.trim().length >= 2 });
  const assign = useMutation({
    mutationFn: (t) => api.assignPayment({ txId: row.txId, type: t.type, id: t.id }),
    onSuccess: () => onDone(`Assigned ${row.mpesaCode}.`),
    onError: (e) => setError(e.message),
  });
  const ignore = useMutation({
    mutationFn: () => api.ignorePayment({ txId: row.txId, reason: reason.trim() }),
    onSuccess: () => onDone(`Ignored ${row.mpesaCode}.`),
    onError: (e) => setError(e.message),
  });

  const list = (items, empty) =>
    items?.length ? (
      <ul className="pay-targets">
        {items.map((t) => (
          <li key={`${t.type}:${t.id}`}>
            <div>
              <strong>{t.name}</strong> <span className="muted">{t.town ?? "no town"} · {t.ref}</span>
              {t.reason && t.reason !== "search" && t.reason !== "name" ? <div className="muted">Suggested: {t.reason}</div> : null}
            </div>
            <button type="button" className="secondary-button" disabled={assign.isPending} onClick={() => { setError(""); assign.mutate(t); }}>
              Assign to this business
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">{empty}</p>
    );

  return (
    <tr>
      <td colSpan={COLS}>
        <div className="pay-assign" role="group" aria-label={`Assign payment ${row.mpesaCode}`}>
          <p>
            <strong>{kes(row.amount)}</strong> arrived with the account <strong>“{row.account || "(empty)"}”</strong>. {NOTE[row.note] ?? ""}
            {" "}The money is recorded and safe. Choose the shop it belongs to.
          </p>
          {row.candidates.length ? <>{<h3>Likely shops</h3>}{list(row.candidates, "")}</> : null}
          <label>
            Search any shop by name, town, phone or reference
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 letters" />
          </label>
          {q.trim().length >= 2 ? list(found.data, found.isLoading ? "Searching…" : "No shop found.") : null}
          <div className="pay-assign__ignore">
            <label>
              Not ours, a refund or a test? Ignore it with a reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Paid to the wrong paybill, refunded" />
            </label>
            <button type="button" className="secondary-button" disabled={ignore.isPending || reason.trim().length < 3} onClick={() => { setError(""); ignore.mutate(); }}>
              Ignore payment
            </button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </div>
      </td>
    </tr>
  );
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { can, why } = usePermissions();
  const canPay = can("payments.confirm");
  const whyPay = why("payments.confirm");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState("action");
  const [assigning, setAssigning] = useState(null);

  const { data = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api.getPayments(),
    refetchInterval: 30000,
  });
  const callbacks = useQuery({ queryKey: ["admin-callbacks"], queryFn: () => api.getUnprocessedCallbacks(), refetchInterval: 60000 });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    queryClient.invalidateQueries({ queryKey: ["admin-callbacks"] });
  };

  const confirm = useMutation({
    mutationFn: async (row) => {
      const months = Math.max(row.suggestedMonths ?? 1, 1);
      const args = { applicationId: row.applicationId, mpesaCode: row.appPaymentCode ?? row.mpesaCode, amount: months * row.expected, months };
      let out = await api.confirmPayment(args);
      if (out?.requiresAcknowledgement) {
        const text = (out.warnings ?? []).map((w) => w.message).join("\n");
        if (!window.confirm(`${text}\n\nConfirm this payment anyway?`)) return null;
        out = await api.confirmPayment({ ...args, acknowledgeWarnings: true });
      }
      return out;
    },
    onSuccess: (out) => {
      if (!out) return;
      setNotice({
        ok: true,
        text: `Payment confirmed. Seller ID ${out.sellerId}, temporary password ${out.temporaryPassword}. ${out.smsSent ? "It was also sent to the seller by SMS." : "SMS was not sent, so give the seller these details."}`,
      });
      refresh();
    },
    onError: (e) => setNotice({ ok: false, text: e.message }),
  });

  const rowsAll = data;
  const needs = rowsAll.filter((r) => NEEDS_ACTION.has(r.status));
  const unassigned = rowsAll.filter((r) => r.status === "needs_assignment").length;
  const ready = rowsAll.filter((r) => r.status === "awaiting_confirmation").length;
  // Opened from a header search result: show every payment that matches it, whatever its status.
  const rows = q
    ? rowsAll.filter((r) => matchesText([r.mpesaCode, r.appPaymentCode, r.businessName, r.payerName, r.reference, r.receipt, r.account, r.phone], q))
    : filter === "action" ? needs : rowsAll;
  const stuck = callbacks.data ?? [];

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Payments</h2>
          {q ? (
            <p className="muted" role="status">
              Showing payments matching “{q}”.{" "}
              <button type="button" className="admin-bell__markall" onClick={() => setParams({}, { replace: true })}>Clear</button>
            </p>
          ) : null}
          <div className="pay-chips" role="tablist" aria-label="Filter payments">
            <button type="button" role="tab" aria-selected={filter === "action"} className={filter === "action" ? "chip chip--on" : "chip"} onClick={() => setFilter("action")}>
              Needs action ({needs.length})
            </button>
            <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "chip chip--on" : "chip"} onClick={() => setFilter("all")}>
              All ({rowsAll.length})
            </button>
          </div>
        </div>

        <p className="muted">
          {ready ? `${ready} ready to confirm. ` : ""}{unassigned ? `${unassigned} need assigning. ` : ""}
          {!ready && !unassigned ? "Nothing is waiting for you." : ""}
        </p>

        {error ? <ErrorCard what="payments" error={error} onRetry={() => refetch()} retrying={isFetching} /> : null}
        {notice ? <p role={notice.ok ? "status" : "alert"}>{notice.text}</p> : null}

        {stuck.length ? (
          <div className="banner banner--error" role="alert">
            <strong>{stuck.length} callback{stuck.length === 1 ? "" : "s"} from Safaricom could not be processed.</strong> They are saved; nothing is lost.
            <ul className="pay-targets">
              {stuck.map((c) => (
                <li key={c.id}>
                  <div>
                    {c.code ?? "No code"} · {c.amount ? kes(c.amount) : "no amount"} · {c.account || "no account"}
                    <div className="muted">{when(c.at)} · {c.error}</div>
                  </div>
                  <span>
                    <button type="button" className="secondary-button" disabled={!canPay} title={whyPay} onClick={async () => { try { await api.reprocessCallback(c.id); } catch (e) { setNotice({ ok: false, text: e.message }); } refresh(); }}>Reprocess</button>{" "}
                    <button type="button" className="secondary-button" disabled={!canPay} title={whyPay} onClick={async () => { try { await api.dismissCallback(c.id); } catch (e) { setNotice({ ok: false, text: e.message }); } refresh(); }}>Dismiss</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Account typed</th>
                <th scope="col">Amount</th>
                <th scope="col">M-Pesa code</th>
                <th scope="col">Paid by</th>
                <th scope="col">Status</th>
                <th scope="col">When</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: COLS }).map((__, j) => <td key={j}><Skeleton /></td>)}</tr>
                  ))
                : rows.flatMap((row) => {
                    const st = STATUS[row.status] ?? { label: row.status, tone: "neutral" };
                    const months = row.suggestedMonths;
                    const missing = row.status === "part_paid" && row.expected != null ? Math.max(row.expected - (row.credit ?? 0), 0) : null;
                    const line = (
                      <tr key={row.key}>
                        <td>
                          <strong>{row.businessName}</strong>
                          <div className="muted">{[row.town, row.reference, row.receipt].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>{row.account || "—"}</td>
                        <td>
                          <strong>{kes(row.amount)}</strong>
                          {row.status === "awaiting_confirmation" && months ? <div className="muted">Covers {months} month{months === 1 ? "" : "s"} ({kes(row.credit)} received)</div> : null}
                          {missing ? <div className="muted">{kes(row.credit)} so far, {kes(missing)} still due</div> : null}
                        </td>
                        <td><code>{row.mpesaCode}</code></td>
                        <td>
                          {row.payerName || "—"}
                          {row.phone ? <div className="muted">{row.phone}</div> : null}
                        </td>
                        <td>
                          <span className={`status-pill status-pill--${st.tone}`}>{st.label}</span>
                          {row.status === "needs_assignment" && row.note ? <div className="muted">{NOTE[row.note] ?? row.note}</div> : null}
                        </td>
                        <td>{when(row.at)}</td>
                        <td>
                          {row.status === "awaiting_confirmation" && row.applicationId ? (
                            <button type="button" className="secondary-button" disabled={confirm.isPending || !canPay} title={whyPay} onClick={() => { setNotice(null); confirm.mutate(row); }}>
                              Confirm payment
                            </button>
                          ) : null}
                          {row.status === "needs_assignment" ? (
                            <button type="button" className="secondary-button" disabled={!canPay} title={whyPay} onClick={() => setAssigning(assigning === row.key ? null : row.key)}>
                              {assigning === row.key ? "Cancel" : "Choose business"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                    return assigning === row.key
                      ? [line, <AssignPanel key={`${row.key}-assign`} row={row} onClose={() => setAssigning(null)}
                          onDone={(text) => { setAssigning(null); setNotice({ ok: true, text }); refresh(); }} />]
                      : [line];
                  })}
              {!isLoading && !rows.length && !error ? (
                <tr>
                  <td colSpan={COLS}>
                    {filter === "action" ? (
                      <EmptyState icon={faCircleCheck} title="No payments need your action" action={rowsAll.length ? { label: `Show all ${rowsAll.length} payments`, onClick: () => setFilter("all") } : undefined}>
                        New payments appear here as soon as a seller pays your Paybill.
                      </EmptyState>
                    ) : (
                      <EmptyState icon={faCreditCard} title="No payments yet">Payments show up here as soon as a seller pays your Paybill.</EmptyState>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
