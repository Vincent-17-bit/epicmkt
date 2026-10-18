import { useState } from "react";
import { api } from "../api/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Payments arrive by themselves: Safaricom tells the backend, the backend records the M-Pesa code.
// Nobody types a code here. "Needs confirming" rows only need a click.
const STATUS = {
  awaiting_confirmation: { label: "Needs confirming", tone: "live" },
  submitted: { label: "Needs confirming", tone: "live" },
  amount_short: { label: "Paid too little", tone: "neutral" },
  extra: { label: "Extra payment", tone: "neutral" },
  unmatched: { label: "No matching business", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "healthy" },
  rejected: { label: "Rejected", tone: "neutral" },
};
const CAN_CONFIRM = new Set(["awaiting_confirmation", "amount_short"]);

const kes = (n) => `KES ${Number(n ?? 0).toLocaleString("en-KE")}`;
const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "";

const COLS = 8;

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api.getPayments(),
    refetchInterval: 30000,
  });

  const confirm = useMutation({
    mutationFn: async (row) => {
      const args = { applicationId: row.applicationId, mpesaCode: row.mpesaCode, amount: row.amount };
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
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e) => setNotice({ ok: false, text: e.message }),
  });

  const waiting = data.filter((r) => CAN_CONFIRM.has(r.status)).length;

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Payments{waiting ? ` (${waiting} to confirm)` : ""}</h3>
          <button type="button" className="secondary-button">Record manual payment</button>
        </div>

        {error ? <p role="alert">{error.message}</p> : null}
        {notice ? <p role={notice.ok ? "status" : "alert"}>{notice.text}</p> : null}

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Account paid to</th>
                <th>Amount</th>
                <th>M-Pesa code</th>
                <th>Paid by</th>
                <th>Status</th>
                <th>When</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: COLS }).map((__, j) => <td key={j}><span className="skeleton" /></td>)}</tr>
                  ))
                : data.map((row) => {
                    const st = STATUS[row.status] ?? { label: row.status, tone: "neutral" };
                    const short = row.expected != null && row.amount !== row.expected;
                    return (
                      <tr key={row.key}>
                        <td>
                          <strong>{row.businessName}</strong>
                          <div className="muted">{[row.reference, row.receipt].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>
                          {row.account || "—"}
                          {row.paybill ? <div className="muted">Paybill {row.paybill}</div> : null}
                        </td>
                        <td>
                          <strong>{kes(row.amount)}</strong>
                          {short ? <div className="muted">Expected {kes(row.expected)}</div> : null}
                        </td>
                        <td><code>{row.mpesaCode}</code></td>
                        <td>
                          {row.payerName || "—"}
                          {row.phone ? <div className="muted">{row.phone}</div> : null}
                        </td>
                        <td><span className={`status-pill status-pill--${st.tone}`}>{st.label}</span></td>
                        <td>{when(row.at)}</td>
                        <td>
                          {CAN_CONFIRM.has(row.status) && row.applicationId ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={confirm.isPending}
                              onClick={() => { setNotice(null); confirm.mutate(row); }}
                            >
                              Confirm
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && !data.length && !error ? (
                <tr><td colSpan={COLS}>No payments yet. They appear here as soon as a seller pays your Paybill.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
