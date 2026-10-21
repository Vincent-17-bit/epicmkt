import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { BADGES, groupPlans, planImpact, planProblems } from "../../lib/catalogue.js";

const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
const day = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function EditDialog({ row, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [price, setPrice] = useState(String(row.price_kes));
  const [benefits, setBenefits] = useState(row.top_benefits);
  const [badge, setBadge] = useState(row.badge ?? "");
  const [reason, setReason] = useState("");
  const priceNum = price.trim() === "" ? NaN : Number(price);
  const priceChanged = priceNum !== row.price_kes;
  const problems = planProblems({ price: priceNum, benefits, badge });
  const needsReason = priceChanged && reason.trim().length < 5;
  const save = useMutation({
    mutationFn: () => api.savePlan({ category: row.category_id, plan: row.plan_key, price: priceNum, benefits, badge, reason: reason.trim() || null }),
    onSuccess: (version) => {
      toast.push({ message: version === 0 ? "Nothing changed." : "Plan saved. The change is in the history." });
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      onClose();
    },
  });
  const impact = Number.isFinite(priceNum) ? planImpact(row, priceNum) : [];
  const ready = problems.length === 0 && !needsReason && !save.isPending;
  return (
    <Modal title={`${row.category_name}: ${row.plan_key} plan`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}>
        <label className="field">Monthly price (KES)<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} /></label>
        {benefits.map((b, i) => (
          <label className="field" key={i}>Benefit {i + 1}
            <input value={b} maxLength={80} onChange={(e) => setBenefits(benefits.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        <label className="field">Badge
          <select value={badge} onChange={(e) => setBadge(e.target.value)}>{BADGES.map((b) => <option key={b} value={b}>{b || "No badge"}</option>)}</select>
        </label>
        {priceChanged && (
          <>
            {impact.map((line, i) => <p key={i} className="plan-impact">{line}</p>)}
            <label className="field">Why is the price changing? (recorded in the history)
              <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            </label>
          </>
        )}
        {problems.map((p) => <p key={p} className="modal__error">{p}</p>)}
        {save.isError ? <p className="modal__error" role="alert">{save.error.message}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>{save.isPending ? "Saving" : "Save plan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryDialog({ row, onClose }) {
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-plan-history", row.category_id, row.plan_key], queryFn: () => api.getPlanHistory({ category: row.category_id, plan: row.plan_key }) });
  return (
    <Modal title={`History: ${row.category_name} ${row.plan_key}`} onClose={onClose}>
      {isError ? <LoadError what="the history" error={error} onRetry={refetch} /> : isLoading ? <p>Loading…</p> : (
        <ol className="plan-history">
          {data.map((v) => (
            <li key={v.id}>
              <strong>{kes(v.price_kes)}</strong>{v.badge ? ` · ${v.badge}` : ""} <span className="muted">{day(v.created_at)}{v.changed_by_email ? ` by ${v.changed_by_email}` : ""}</span>
              <div>{(v.top_benefits ?? []).join(" · ")}</div>
              {v.reason ? <div className="muted">Reason: {v.reason}</div> : null}
            </li>
          ))}
        </ol>
      )}
      <div className="modal__footer"><Button onClick={onClose}>Close</Button></div>
    </Modal>
  );
}

export default function PlansPage() {
  const { can, why } = usePermissions();
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.listPlans() });
  const groups = groupPlans(data);
  const canEdit = can("plans.edit");

  const cell = (row) => (!row ? <td>–</td> : (
    <td>
      <strong>{row.price_kes === 0 ? <span className="text-danger">Not priced</span> : kes(row.price_kes)}</strong>{row.badge ? <span className="muted"> · {row.badge}</span> : null}
      <div className="muted">{row.live_businesses} live · {row.versions} {row.versions === 1 ? "version" : "versions"}</div>
      <div className="row-actions">
        <Button size="sm" disabled={!canEdit} title={why("plans.edit")} onClick={() => setEditing(row)} aria-label={`Edit ${row.category_name} ${row.plan_key} plan`}>Edit</Button>
        <Button size="sm" onClick={() => setViewing(row)} aria-label={`History of ${row.category_name} ${row.plan_key} plan`}>History</Button>
      </div>
    </td>
  ));

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h3>Plans and pricing</h3></div>
        <p className="muted">Price changes reach new and unpaid applications and the seller and application pages straight away. A payment that covers the price and matches the category activates the shop automatically. Sellers already live keep the monthly price on their account.</p>
        {isError ? <LoadError what="plans" error={error} onRetry={refetch} /> : (
          <div className="table-shell">
            <table>
              <thead><tr><th>Category</th><th>Standard</th><th>Premium</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={3}><span className="skeleton" /></td></tr>
                  : groups.map((g) => (
                    <tr key={g.category_id}>
                      <td><strong>{g.category_name}</strong><div className="muted">{g.grp}{g.active ? "" : " · switched off"}</div></td>
                      {cell(g.plans.standard)}
                      {cell(g.plans.premium)}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
      {viewing && <HistoryDialog row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
