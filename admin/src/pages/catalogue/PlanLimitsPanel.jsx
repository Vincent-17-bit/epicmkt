import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { LIMIT_GROUPS, PLAN_NAMES, SWITCHES, limitsChanged, limitsForm, limitsImpact, limitsPayload, limitsProblems } from "../../lib/catalogue.js";

// Plan limits and feature switches (Prompt 11.5): one card per plan. The numbers can only lower what the editor allows; a switch that is off
// hides that feature from the plan's shops. Impact lines say how many live shops are on the plan before anything is saved.
function PlanCard({ plan, stored, rows, canEdit, why }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const uid = useId();
  const initial = useMemo(() => limitsForm({ [plan]: stored }, plan), [plan, stored]);
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  useEffect(() => { setForm(initial); setReason(""); }, [initial]);

  const globalLimits = { [plan]: stored };
  const problems = limitsProblems(form);
  const changed = limitsChanged(plan, globalLimits, form);
  const impact = changed ? limitsImpact(plan, globalLimits, form, rows) : [];
  const needsReason = changed && reason.trim().length < 5;
  const save = useMutation({
    mutationFn: () => api.savePlanLimits({ plan, limits: limitsPayload(form), reason: reason.trim() || null }),
    onSuccess: () => {
      toast.push({ message: `${PLAN_NAMES[plan]} limits saved. The change is in the audit log.` });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-limits"] });
    },
  });
  const ready = canEdit && changed && Object.keys(problems).length === 0 && !needsReason && !save.isPending;
  const setNumber = (group, key, value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value.replace(/[^\d]/g, "") } }));

  return (
    <form className="plan-limits__card" aria-labelledby={`${uid}-title`} onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}>
      <h3 className="heading-sm" id={`${uid}-title`}>{PLAN_NAMES[plan]}</h3>
      {LIMIT_GROUPS.map((g) => (
        <fieldset key={g.key} className="plan-limits__group" disabled={!canEdit}>
          <legend>{g.title}</legend>
          {g.fields.map((f) => {
            const id = `${uid}-${g.key}-${f.key}`;
            const error = problems[`${g.key}.${f.key}`];
            return (
              <div className="plan-limits__field" key={f.key}>
                <label htmlFor={id}>{f.label}</label>
                <input id={id} inputMode="numeric" value={form[g.key][f.key]} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} onChange={(e) => setNumber(g.key, f.key, e.target.value)} />
                <span className={error ? "text-danger" : "muted"} id={`${id}-hint`} role={error ? "alert" : undefined}>{error ?? `${f.min} to ${f.max}`}</span>
              </div>
            );
          })}
        </fieldset>
      ))}
      <fieldset className="plan-limits__group" disabled={!canEdit}>
        <legend>Features on this plan</legend>
        {SWITCHES.map((s) => {
          const id = `${uid}-sw-${s.key}`;
          return (
            <label className="plan-limits__switch" htmlFor={id} key={s.key}>
              <input id={id} type="checkbox" checked={form.features[s.key]} aria-describedby={`${id}-hint`} onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, [s.key]: e.target.checked } }))} />
              <span><strong>{s.label}</strong><span className="muted" id={`${id}-hint`}>{s.hint}</span></span>
            </label>
          );
        })}
      </fieldset>
      {impact.map((line, i) => <p key={i} className="plan-impact">{line}</p>)}
      {changed && (
        <label className="field">Why are the limits changing? (recorded in the audit log)
          <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {save.isError ? <p className="modal__error" role="alert">{save.error.message}</p> : null}
      <div className="plan-limits__actions">
        <Button type="button" onClick={() => { setForm(initial); setReason(""); }} disabled={!changed || save.isPending}>Reset</Button>
        <Button type="submit" variant="primary" disabled={!ready} title={why("plans.edit")}>{save.isPending ? "Saving" : `Save ${PLAN_NAMES[plan]} limits`}</Button>
      </div>
    </form>
  );
}

export default function PlanLimitsPanel({ rows }) {
  const { can, why } = usePermissions();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-plan-limits"], queryFn: () => api.getPlanLimits() });
  return (
    <section className="panel plan-limits" aria-labelledby="plan-limits-title">
      <div className="panel__header"><h2 className="heading-sm" id="plan-limits-title">Limits and features by plan</h2></div>
      <p className="muted">A plan can only lower what the seller editor allows, never raise it. A feature that is switched off disappears for every shop on that plan, in every category. Limits apply the next time a seller edits an item; saved items are not changed. Plan prices and the counts above are not affected.</p>
      {isError ? <LoadError what="the plan limits" error={error} onRetry={refetch} />
        : isLoading ? <span className="skeleton" />
          : <div className="plan-limits__grid">{["standard", "premium"].map((plan) => <PlanCard key={plan} plan={plan} stored={data?.[plan] ?? {}} rows={rows} canEdit={can("plans.edit")} why={why} />)}</div>}
    </section>
  );
}
