import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlanComparison, PlanPicker } from "@epicmkt/shared/plans";
import plansApi from "../../api/plans.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import LeaveDialog from "../../components/LeaveDialog.jsx";
import Tabs from "../../components/Tabs.jsx";
import { useUnsavedGuard } from "../../lib/useUnsavedGuard.js";
import { useToast } from "../../components/Toast.jsx";
import PlanEditor from "./PlanEditor.jsx";
import LimitsPanel from "./LimitsPanel.jsx";
import CouponsPanel from "./CouponsPanel.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import { planPairSchema, validate } from "./schema.js";
import { describeImpact, isDirty } from "./impact.js";
import "./plans.css";

const TABS = [
  { id: "plans", label: "Plans" },
  { id: "limits", label: "Global limits" },
  { id: "coupons", label: "Coupons" },
  { id: "history", label: "History" },
];

const toForm = (plans) => ({
  standard: { ...plans.standard, topBenefits: [...plans.standard.topBenefits] },
  premium: { ...plans.premium, topBenefits: [...plans.premium.topBenefits] },
});

// What the public page receives: the parsed form when valid, otherwise the last saved plan.
const toPublic = (p) => ({ price: p.price, limits: { items: p.items }, topBenefits: p.topBenefits, features: p.features, badge: p.badge, trialDays: p.trialDays });

export default function PlansPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("plans");
  const [categoryId, setCategoryId] = useState("");
  const [form, setForm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [previewKind, setPreviewKind] = useState("wizard");

  const catalog = useQuery({ queryKey: ["admin-plan-catalog"], queryFn: plansApi.listPlanCatalog });
  const categories = catalog.data?.categories ?? [];
  const category = categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;
  const saved = category ? toForm(category.plans) : null;

  // Load the form when the category changes or fresh data arrives and there is nothing unsaved.
  useEffect(() => {
    if (category && (!form || form.categoryId !== category.id)) setForm({ categoryId: category.id, values: toForm(category.plans) });
  }, [category, form]);

  const values = form?.values ?? null;
  const checked = useMemo(() => (values ? validate(planPairSchema, values) : null), [values]);
  const dirty = Boolean(values && saved && isDirty(values, saved));

  const impactStats = useQuery({
    queryKey: ["admin-plan-impact", category?.id],
    enabled: Boolean(category) && dirty,
    queryFn: async () => {
      const [standard, premium] = await Promise.all([plansApi.getPlanImpact(category.id, "standard"), plansApi.getPlanImpact(category.id, "premium")]);
      return { standard, premium };
    },
  });

  const impact = useMemo(() => {
    if (!dirty || !checked?.ok) return [];
    return ["standard", "premium"].flatMap((planKey) =>
      describeImpact({ planKey, before: saved[planKey], after: checked.data[planKey], stats: impactStats.data?.[planKey] }).map((text) => ({ planKey, text })),
    );
  }, [dirty, checked, saved, impactStats.data]);

  const guard = useUnsavedGuard(dirty);
  const [pendingCategory, setPendingCategory] = useState(null);

  const save = useMutation({
    mutationFn: ({ reason }) => plansApi.savePlans({ categoryId: category.id, values: checked.data, reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-plan-catalog"] });
      await qc.invalidateQueries({ queryKey: ["admin-plan-versions"] });
      setConfirming(false);
      setSaveError("");
      setForm(null);
      toast.push({ message: "Plans saved. The Become a Seller page shows them now." });
    },
    onError: (e) => setSaveError(e.message === "reason_required" ? "A reason is required when the price changes." : "Could not save. Nothing was changed."),
  });

  const applyCategory = (id) => {
    setCategoryId(id);
    setForm(null);
    setPendingCategory(null);
  };
  const switchCategory = (id) => (dirty ? setPendingCategory(id) : applyCategory(id));

  if (catalog.isLoading) return <div className="page-shell" role="status">Loading plans…</div>;
  if (catalog.isError)
    return (
      <div className="page-shell" role="alert">
        <p>Could not load plans.</p>
        <Button onClick={() => catalog.refetch()}>Try again</Button>
      </div>
    );
  if (!category || !values) return <div className="page-shell" role="status">Loading plans…</div>;

  const previewPlans = {
    standard: toPublic(checked.ok ? checked.data.standard : category.plans.standard),
    premium: toPublic(checked.ok ? checked.data.premium : category.plans.premium),
  };
  const errors = checked.errors;
  const errorCount = Object.keys(errors).length;

  return (
    <div className="page-shell plans-page">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Plans sections" idPrefix="plans" />
      <div id="plans-panel" role="tabpanel" aria-labelledby={`plans-tab-${tab}`}>
        {tab === "plans" ? (
          <div className="plans-layout">
            <section className="panel" aria-label="Plan editor">
              <div className="panel__header">
                <h3>Edit plans</h3>
                <label className="plans-category">
                  Category
                  <select value={category.id} onChange={(e) => switchCategory(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (tier {c.tier})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {["standard", "premium"].map((planKey) => (
                <PlanEditor
                  key={planKey}
                  planKey={planKey}
                  value={values[planKey]}
                  errors={errors}
                  onChange={(next) => setForm({ categoryId: category.id, values: { ...values, [planKey]: next } })}
                />
              ))}

              {impact.length ? (
                <div className="plans-impact" role="note" aria-label="Who is affected">
                  <strong>Who is affected</strong>
                  <ul>
                    {impact.map((n) => (
                      <li key={n.text}>{n.text}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="plans-actions">
                <span aria-live="polite">{errorCount ? `${errorCount} problem${errorCount === 1 ? "" : "s"} to fix` : dirty ? "Unsaved changes" : "All changes saved"}</span>
                <Button onClick={() => setForm({ categoryId: category.id, values: toForm(category.plans) })} disabled={!dirty}>
                  Discard
                </Button>
                <Button variant="primary" onClick={() => setConfirming(true)} disabled={!dirty || !checked.ok}>
                  Review and save
                </Button>
              </div>
            </section>

            <section className="panel plans-preview" aria-label="Live preview of the Become a Seller plans">
              <div className="panel__header">
                <h3>Live preview</h3>
                <div className="plans-preview__switch" role="group" aria-label="Preview page">
                  <button type="button" className="secondary-button" aria-pressed={previewKind === "wizard"} onClick={() => setPreviewKind("wizard")}>
                    Become a Seller form
                  </button>
                  <button type="button" className="secondary-button" aria-pressed={previewKind === "marketing"} onClick={() => setPreviewKind("marketing")}>
                    Sell page table
                  </button>
                </div>
              </div>
              <p className="plans-preview__note">Exactly what sellers see for {category.name}. Cards are not clickable here.</p>
              {previewKind === "wizard" ? (
                <PlanPicker category={{ id: category.id, name: category.name, plans: previewPlans }} planKey={null} readOnly />
              ) : (
                <PlanComparison plans={previewPlans} globalLimits={catalog.data.globalLimits} />
              )}
            </section>
          </div>
        ) : null}
        {tab === "limits" ? <LimitsPanel globalLimits={catalog.data.globalLimits} /> : null}
        {tab === "coupons" ? <CouponsPanel categories={categories} /> : null}
        {tab === "history" ? <HistoryPanel category={category} categories={categories} onPickCategory={switchCategory} /> : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          title={`Save plans for ${category.name}`}
          summary={impact.length ? "These changes go live on the Become a Seller page immediately." : "Save these changes."}
          confirmLabel="Save plans"
          busy={save.isPending}
          error={saveError}
          onConfirm={(reason) => save.mutate({ reason })}
          onCancel={() => {
            setConfirming(false);
            setSaveError("");
          }}
        >
          <ul className="plans-impact__list">
            {impact.map((n) => (
              <li key={n.text}>{n.text}</li>
            ))}
          </ul>
        </ConfirmDialog>
      ) : null}

      {guard.blocked ? <LeaveDialog onLeave={guard.proceed} onStay={guard.stay} /> : null}
      {pendingCategory ? (
        <LeaveDialog
          title="Discard changes?"
          message="You have unsaved changes to this category. Switching discards them."
          leaveLabel="Discard and switch"
          onLeave={() => applyCategory(pendingCategory)}
          onStay={() => setPendingCategory(null)}
        />
      ) : null}
    </div>
  );
}
