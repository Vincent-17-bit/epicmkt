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
import { formatKes } from "@epicmkt/shared";

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
            <strong>{formatKes(row.amount)}</strong> arrived with the account <strong>“{row.account || "(empty)"}”</strong>. {NOTE[row.note] ?? ""}
            {" "}The money is recorded and safe. Choose the shop it belongs to.
          </p>
          {row.candidates.length ? <>{<h3 className="heading-flow">Likely shops</h3>}{list(row.candidates, "")}</> : null}
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

// "Pay now" (STK Push) prompts. Every prompt is listed, so nothing about a phone payment is ever invisible. A disputed one
// (a success callback that did not check out) or one Safaricom says was paid but whose receipt never came needs a person:
// compare with the M-Pesa statement, then credit it with the statement's receipt and amount, or close it.
const STK_STATUS = {
  creating: { label: "Sending", tone: "neutral" },
  pending: { label: "Waiting for PIN", tone: "neutral" },
  confirming: { label: "Paid, receipt on its way", tone: "live" },
  paid: { label: "Paid", tone: "healthy" },
  failed: { label: "Not completed", tone: "neutral" },
  expired: { label: "No answer", tone: "neutral" },
  error: { label: "Could not send", tone: "neutral" },
  disputed: { label: "Needs checking", tone: "live" },
};
const STK_PURPOSE = { first: "First payment", renewal: "Renewal", upgrade: "Upgrade", category_change: "Category change" };
const STK_RESOLVABLE = new Set(["disputed", "confirming", "expired"]);
const STK_COLS = 6;
const localPhone = (p) => (/^254\d{9}$/.test(p ?? "") ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p ?? "");

function StkResolve({ row, onClose, onDone }) {
  const [receipt, setReceipt] = useState("");
  const [amount, setAmount] = useState(String(row.amount ?? ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const act = useMutation({
    mutationFn: (action) => api.resolveStkRequest({ id: row.id, action, receipt: action === "credit" ? receipt.trim().toUpperCase() : null, amount: action === "credit" ? Number(amount) : null, reason: reason.trim() }),
    onSuccess: (_out, action) => onDone(action === "credit" ? `Credited ${receipt.trim().toUpperCase()} to ${row.businessName}.` : "Prompt closed."),
    onError: (e) => setError(e.message),
  });
  return (
    <tr>
      <td colSpan={STK_COLS}>
        <div className="pay-assign" role="group" aria-label={`Resolve phone prompt for ${row.businessName}`}>
          <p>
            {row.note ? <>This prompt did not check out: <strong>{row.note}</strong>. </> : null}
            Find the payment on the M-Pesa statement. If it is there, credit it with the statement's receipt and amount; if not, close the prompt.
          </p>
          <label>M-Pesa receipt from the statement<input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="e.g. SK12AB34CD" maxLength={10} /></label>
          <label>Amount on the statement (KES)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" /></label>
          <label>Reason (kept in the audit log)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Checked the statement, paid" /></label>
          <div className="pay-assign__ignore">
            <button type="button" className="secondary-button" disabled={act.isPending || reason.trim().length < 3 || receipt.trim().length !== 10} onClick={() => { setError(""); act.mutate("credit"); }}>Credit this payment</button>{" "}
            <button type="button" className="secondary-button" disabled={act.isPending || reason.trim().length < 3} onClick={() => { setError(""); act.mutate("close"); }}>Close, not paid</button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}

function PhonePrompts({ q, canPay, whyPay, onNotice }) {
  const queryClient = useQueryClient();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(null);
  const list = useQuery({ queryKey: ["admin-stk"], queryFn: () => api.getStkRequests(), refetchInterval: 30000 });
  const rowsAll = list.data ?? [];
  const needs = rowsAll.filter((r) => r.status === "disputed" || r.status === "confirming");
  const rows = q
    ? rowsAll.filter((r) => matchesText([r.businessName, r.reference, r.receipt, r.phone, r.account], q))
    : all ? rowsAll : rowsAll.slice(0, 20);
  const done = (text) => {
    setOpen(null);
    onNotice({ ok: true, text });
    for (const key of ["admin-stk", "admin-payments", "admin-callbacks"]) queryClient.invalidateQueries({ queryKey: [key] });
  };
  return (
    <section className="panel" aria-labelledby="stk-title">
      <div className="panel__header">
        <h2 className="heading-sm" id="stk-title">Phone prompts (Pay now)</h2>
        <p className="muted">{needs.length ? `${needs.length} need checking.` : "Every M-Pesa prompt sellers and applicants started, and what Safaricom answered."}</p>
      </div>
      {list.error ? <ErrorCard what="phone prompts" error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} /> : null}
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th scope="col">Business</th>
              <th scope="col">For</th>
              <th scope="col">Amount</th>
              <th scope="col">Phone</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: STK_COLS }).map((__, j) => <td key={j}><Skeleton /></td>)}</tr>)
              : rows.flatMap((r) => {
                  const st = STK_STATUS[r.status] ?? { label: r.status, tone: "neutral" };
                  const line = (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.businessName}</strong>
                        <div className="muted">{[r.town, r.reference, when(r.at)].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td>{STK_PURPOSE[r.purpose] ?? r.purpose}{r.months > 1 ? <div className="muted">{r.months} months</div> : null}</td>
                      <td>
                        <strong>{formatKes(r.amount)}</strong>
                        {r.paidAmount != null && r.paidAmount !== r.amount ? <div className="muted">Callback said {formatKes(r.paidAmount)}</div> : null}
                      </td>
                      <td><span style={{ whiteSpace: "nowrap" }}>{localPhone(r.phone)}</span><div className="muted">by {r.by}</div></td>
                      <td>
                        <span className={`status-pill status-pill--${st.tone}`}>{st.label}</span>
                        {r.receipt ? <div className="muted"><code>{r.receipt}</code></div> : null}
                        {r.status === "failed" || r.status === "error" ? <div className="muted">{r.resultDesc ?? r.message}</div> : null}
                        {r.status === "disputed" && r.note ? <div className="muted">{r.note}</div> : null}
                        {r.status === "paid" && r.verification === "query_unavailable" ? <div className="muted">Not double-checked (Safaricom busy)</div> : null}
                      </td>
                      <td>
                        {STK_RESOLVABLE.has(r.status) ? (
                          <button type="button" className="secondary-button" disabled={!canPay} title={whyPay} onClick={() => setOpen(open === r.id ? null : r.id)}>
                            {open === r.id ? "Cancel" : "Check and resolve"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                  return open === r.id ? [line, <StkResolve key={`${r.id}-resolve`} row={r} onClose={() => setOpen(null)} onDone={done} />] : [line];
                })}
            {!list.isLoading && !rows.length && !list.error ? (
              <tr><td colSpan={STK_COLS}><EmptyState icon={faCreditCard} title="No phone prompts yet">They appear here as soon as a seller or applicant presses Pay now.</EmptyState></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!q && rowsAll.length > 20 ? (
        <button type="button" className="secondary-button" onClick={() => setAll(!all)}>{all ? "Show the latest 20" : `Show all ${rowsAll.length}`}</button>
      ) : null}
    </section>
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
    queryClient.invalidateQueries({ queryKey: ["admin-stk"] });
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
                    {c.code ?? "No code"} · {c.amount ? formatKes(c.amount) : "no amount"} · {c.account || "no account"}
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
                          <strong>{formatKes(row.amount)}</strong>
                          {row.status === "awaiting_confirmation" && months ? <div className="muted">Covers {months} month{months === 1 ? "" : "s"} ({formatKes(row.credit)} received)</div> : null}
                          {missing ? <div className="muted">{formatKes(row.credit)} so far, {formatKes(missing)} still due</div> : null}
                        </td>
                        <td><code>{row.mpesaCode}</code></td>
                        <td>
                          {row.payerName || "—"}
                          {row.phone ? <div className="muted">{row.phone}</div> : null}
                          {row.channel === "stk" ? <div className="muted">Phone prompt (Pay now)</div> : null}
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
      <PhonePrompts q={q} canPay={canPay} whyPay={whyPay} onNotice={setNotice} />
    </div>
  );
}
