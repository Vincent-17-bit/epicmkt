import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatKes } from "@epicmkt/shared";
import plansApi from "../../api/plans.js";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Button from "../../components/Button.jsx";
import { useToast } from "../../components/Toast.jsx";

const when = (iso) => new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(iso));
const planSummary = (s) => `${formatKes(s.price)}, ${s.items} items, ${s.trialDays} trial days${s.badge ? `, ${s.badge}` : ""}`;

export default function HistoryPanel({ category, categories, onPickCategory }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState("plan");
  const [restoring, setRestoring] = useState(null);
  const versions = useQuery({
    queryKey: ["admin-plan-versions", kind, category.id],
    queryFn: () => plansApi.listPlanVersions({ categoryId: category.id, kind }),
  });

  const restore = useMutation({
    mutationFn: async ({ version, reason }) => {
      if (version.kind === "global_limits") return plansApi.saveGlobalLimits({ limits: version.snapshot, reason });
      const cur = (await plansApi.listPlanCatalog()).categories.find((c) => c.id === version.categoryId);
      const values = { standard: cur.plans.standard, premium: cur.plans.premium, [version.planKey]: { ...cur.plans[version.planKey], ...version.snapshot } };
      return plansApi.savePlans({ categoryId: version.categoryId, values, reason });
    },
    onSuccess: async () => {
      setRestoring(null);
      await qc.invalidateQueries({ queryKey: ["admin-plan-versions"] });
      await qc.invalidateQueries({ queryKey: ["admin-plan-catalog"] });
      toast.push({ message: "Version restored as a new version." });
    },
    onError: () => toast.push({ message: "Could not restore that version.", tone: "error" }),
  });

  return (
    <section className="panel" aria-label="Version history">
      <div className="panel__header">
        <h3>Version history</h3>
        <div className="plans-history-controls">
          <label>
            Show
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="plan">Category plans</option>
              <option value="global_limits">Global limits</option>
            </select>
          </label>
          {kind === "plan" ? (
            <label>
              Category
              <select value={category.id} onChange={(e) => onPickCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      {versions.isLoading ? <p role="status">Loading history…</p> : null}
      {versions.isError ? <p role="alert">Could not load history.</p> : null}
      {versions.data && versions.data.length === 0 ? <p>No saved versions yet. Each save adds one here.</p> : null}
      <ol className="plans-versions">
        {versions.data?.map((v) => (
          <li key={v.id}>
            <div>
              <strong>{when(v.createdAt)}</strong> by {v.changedBy}
              {v.kind === "plan" ? <span> · {v.planKey === "premium" ? "Premium" : "Standard"}: {planSummary(v.snapshot)}</span> : <span> · Global limits changed</span>}
              {v.reason ? <p className="plans-versions__reason">Reason: {v.reason}</p> : null}
            </div>
            <Button size="sm" onClick={() => setRestoring(v)} aria-label={`Restore version from ${when(v.createdAt)}`}>
              Restore
            </Button>
          </li>
        ))}
      </ol>
      {restoring ? (
        <ConfirmDialog
          title="Restore this version"
          summary="This saves the old values again as a new version. History is never rewritten."
          confirmLabel="Restore"
          busy={restore.isPending}
          onConfirm={(reason) => restore.mutate({ version: restoring, reason })}
          onCancel={() => setRestoring(null)}
        />
      ) : null}
    </section>
  );
}
