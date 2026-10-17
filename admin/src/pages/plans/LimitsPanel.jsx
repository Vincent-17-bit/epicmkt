import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import plansApi from "../../api/plans.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import LeaveDialog from "../../components/LeaveDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { useUnsavedGuard } from "../../lib/useUnsavedGuard.js";
import { LIMIT_FIELDS, limitsSchema, validate } from "./schema.js";
import { isDirty } from "./impact.js";

const asForm = (g) => JSON.parse(JSON.stringify(g));

export default function LimitsPanel({ globalLimits }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => asForm(globalLimits));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setForm(asForm(globalLimits)), [globalLimits]);

  const checked = useMemo(() => validate(limitsSchema, form), [form]);
  const saved = { standard: globalLimits.standard, premium: globalLimits.premium };
  const dirty = isDirty({ standard: form.standard, premium: form.premium }, saved);
  const guard = useUnsavedGuard(dirty);

  const save = useMutation({
    mutationFn: ({ reason }) => plansApi.saveGlobalLimits({ limits: checked.data, reason }),
    onSuccess: async () => {
      setConfirming(false);
      setError("");
      await qc.invalidateQueries({ queryKey: ["admin-plan-catalog"] });
      await qc.invalidateQueries({ queryKey: ["admin-plan-versions"] });
      toast.push({ message: "Global limits saved." });
    },
    onError: () => setError("Could not save. Nothing was changed."),
  });

  const set = (plan, key, value) => setForm({ ...form, [plan]: { ...form[plan], [key]: value } });

  return (
    <section className="panel" aria-label="Global limits">
      <div className="panel__header">
        <h3>Global limits</h3>
        <span className="plans-preview__note">Apply to every category. Premium cannot be lower than Standard.</span>
      </div>
      <table className="plans-limits">
        <thead>
          <tr>
            <th scope="col">Limit</th>
            <th scope="col">Standard</th>
            <th scope="col">Premium</th>
          </tr>
        </thead>
        <tbody>
          {LIMIT_FIELDS.map((f) => (
            <tr key={f.key}>
              <th scope="row">{f.label}</th>
              {["standard", "premium"].map((plan) => {
                const id = `limit-${plan}-${f.key}`;
                const err = checked.errors[`${plan}.${f.key}`];
                const unlimited = form[plan][f.key] === null;
                return (
                  <td key={plan}>
                    <input
                      id={id}
                      aria-label={`${f.label}, ${plan}`}
                      inputMode="numeric"
                      value={unlimited ? "" : form[plan][f.key]}
                      placeholder={unlimited ? "Unlimited" : ""}
                      disabled={unlimited}
                      aria-invalid={err ? true : undefined}
                      aria-describedby={err ? `${id}-error` : undefined}
                      onChange={(e) => set(plan, f.key, e.target.value)}
                    />
                    {f.unlimitedAllowed ? (
                      <label className="plans-inline">
                        <input type="checkbox" checked={unlimited} onChange={(e) => set(plan, f.key, e.target.checked ? null : 1)} /> Unlimited
                      </label>
                    ) : null}
                    {err ? (
                      <span className="field__error" id={`${id}-error`} role="alert">
                        {err}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plans-actions">
        <span aria-live="polite">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button onClick={() => setForm(asForm(globalLimits))} disabled={!dirty}>
          Discard
        </Button>
        <Button variant="primary" onClick={() => setConfirming(true)} disabled={!dirty || !checked.ok}>
          Review and save
        </Button>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Save global limits"
          summary="New limits apply to every business straight away. Nothing is deleted if a limit goes down: people above it keep what they have but cannot add more."
          confirmLabel="Save limits"
          busy={save.isPending}
          error={error}
          onConfirm={(reason) => save.mutate({ reason })}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      {guard.blocked ? <LeaveDialog onLeave={guard.proceed} onStay={guard.stay} /> : null}
    </section>
  );
}
