import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { ACTION_TEXT } from "../../api/errors.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { friendlyError } from "../../lib/businessDetail.js";
import { RULES, WEIGHT_KEYS, fromForm, isChanged, toForm, weightShares } from "../../lib/healthConfig.js";

const TONES = ["profile", "freshness", "activity", "trust"];

function Num({ form, errors, set, name, hint }) {
  const id = useId();
  const rule = RULES[name];
  const error = errors[name];
  return (
    <div className="setting-group">
      <label htmlFor={id}>{rule.label}</label>
      <input
        id={id} type="number" inputMode="numeric" min={rule.min} max={rule.max} step="1" value={form[name]} onChange={set(name)}
        aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
      />
      {error ? <span id={`${id}-e`} className="health-set__error">{error}</span> : hint ? <span id={`${id}-h`} className="muted">{hint}</span> : null}
    </div>
  );
}

/** Settings > Business health: the weights and thresholds read by business_health() in SQL. Owner only, like the rest of Settings. */
export default function HealthSettings() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["admin-health-config"], queryFn: () => api.getHealthConfig(), retry: false });
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.listCategories(), retry: false });
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (query.data) setForm(toForm(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (config) => api.saveHealthConfig(config),
    onSuccess: (saved) => {
      setError("");
      setShowErrors(false);
      client.setQueryData(["admin-health-config"], saved);
      client.invalidateQueries({ queryKey: ["business-table"] });
      client.invalidateQueries({ queryKey: ["admin-business-health"] });
      client.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.push({ message: "Health settings saved. Scores are updated." });
    },
    onError: (failure) => setError(ACTION_TEXT[failure?.code] ?? friendlyError(failure, "We could not save the health settings. Try again.")),
  });

  if (query.isError) {
    return <section className="panel"><LoadError what="the health settings" error={query.error} onRetry={query.refetch} /></section>;
  }
  if (!form) return <section className="panel" aria-busy="true"><p className="muted">Loading health settings…</p></section>;

  const { config, errors: all } = fromForm(form);
  const errors = showErrors ? all : {};
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const setCategory = (index, patch) => setForm({ ...form, categories: form.categories.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const used = new Set(form.categories.map((row) => row.id));
  const free = (categories.data ?? []).filter((c) => !used.has(c.id));
  const nameOf = (id) => (categories.data ?? []).find((c) => c.id === id)?.name ?? id;
  const shares = weightShares(form);
  const changed = isChanged(form, query.data);

  const submit = (event) => {
    event.preventDefault();
    setError("");
    if (!config) { setShowErrors(true); return; }
    save.mutate(config);
  };

  return (
    <form className="panel health-set" onSubmit={submit} noValidate>
      <div className="panel__header">
        <div>
          <h2 className="heading-sm">Business health</h2>
          <p className="muted health-set__lede">The score estimates churn risk: how likely a business is to stop paying. Changes apply to every business straight away, and are recorded in the audit log.</p>
        </div>
        <Button type="submit" variant="primary" disabled={!changed || save.isPending}>{save.isPending ? "Saving" : "Save health settings"}</Button>
      </div>

      {error ? <p role="alert" className="admin-login__error">{error}</p> : null}
      {errors.form ? <p role="alert" className="admin-login__error">{errors.form}</p> : null}

      <fieldset className="health-set__group">
        <legend>What counts, and how much</legend>
        <div className="health-set__shares" role="img" aria-label={`Share of the score: ${shares.map((s) => `${s.label} ${s.share}%`).join(", ")}`}>
          {shares.map((s, i) => (
            <span key={s.key} className={`health-set__share health-set__share--${TONES[i]}`} style={{ flexGrow: Math.max(s.share, 0.0001), flexBasis: 0 }}>
              {s.share >= 8 ? <span>{s.label} {s.share}%</span> : null}
            </span>
          ))}
        </div>
        <div className="settings-grid">
          {WEIGHT_KEYS.map(([key]) => <Num key={key} form={form} errors={errors} set={set} name={key} hint={`${shares.find((s) => s.key === key).share}% of the score`} />)}
        </div>
        <p className="muted health-set__note">Weights are relative: 20, 25, 35, 20 and 2, 2.5, 3.5, 2 give the same scores.</p>
      </fieldset>

      <fieldset className="health-set__group">
        <legend>Bands</legend>
        <div className="settings-grid">
          <Num form={form} errors={errors} set={set} name="band_healthy" hint="Healthy: this score or higher" />
          <Num form={form} errors={errors} set={set} name="band_watch" hint="Watch: from here up to Healthy. Below it: At risk" />
        </div>
      </fieldset>

      <fieldset className="health-set__group">
        <legend>New businesses</legend>
        <div className="settings-grid">
          <Num form={form} errors={errors} set={set} name="grace_days" hint="Until this day, no items or no activity yet scores neutral, not 0" />
          <Num form={form} errors={errors} set={set} name="neutral" hint="The neutral score used during the grace period" />
        </div>
      </fieldset>

      <fieldset className="health-set__group">
        <legend>Price freshness</legend>
        <div className="settings-grid">
          <Num form={form} errors={errors} set={set} name="freshness_days" hint="A price counts as fresh if confirmed within this many days" />
        </div>
        <h3 className="health-set__sub">Different window for some categories</h3>
        {form.categories.length ? (
          <ul className="health-set__rows">
            {form.categories.map((row, i) => (
              <li key={i} className="health-set__row">
                <label className="field">
                  Category
                  <select value={row.id} onChange={(e) => setCategory(i, { id: e.target.value })}>
                    {row.id ? <option value={row.id}>{nameOf(row.id)}</option> : <option value="">Choose…</option>}
                    {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  Days
                  <input type="number" inputMode="numeric" min="1" max="365" step="1" value={row.days} onChange={(e) => setCategory(i, { days: e.target.value })} aria-invalid={errors[`category:${i}`] ? "true" : undefined} />
                </label>
                <Button type="button" size="sm" onClick={() => setForm({ ...form, categories: form.categories.filter((_, j) => j !== i) })} aria-label={`Remove ${nameOf(row.id) || "this row"}`}>Remove</Button>
                {errors[`category:${i}`] ? <span className="health-set__error health-set__row-error">{errors[`category:${i}`]}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted health-set__note">None: every category uses the window above.</p>}
        <Button type="button" size="sm" disabled={!free.length} onClick={() => setForm({ ...form, categories: [...form.categories, { id: free[0]?.id ?? "", days: form.freshness_days }] })}>Add a category</Button>
      </fieldset>

      <fieldset className="health-set__group">
        <legend>Activity</legend>
        <div className="settings-grid">
          <Num form={form} errors={errors} set={set} name="activity_full_days" hint="Any login, edit or price confirmation this recent scores 100" />
          <Num form={form} errors={errors} set={set} name="activity_zero_days" hint="Silent for this long scores 0; in between it falls in a straight line" />
        </div>
      </fieldset>

      <fieldset className="health-set__group">
        <legend>Trust</legend>
        <div className="settings-grid">
          <Num form={form} errors={errors} set={set} name="t_flag" />
          <Num form={form} errors={errors} set={set} name="t_flag_cap" />
          <Num form={form} errors={errors} set={set} name="t_report" />
          <Num form={form} errors={errors} set={set} name="t_report_cap" />
          <Num form={form} errors={errors} set={set} name="t_strike" />
          <Num form={form} errors={errors} set={set} name="t_strike_cap" />
          <Num form={form} errors={errors} set={set} name="serious_flag_days" hint="An open flag this old caps the score at “At risk”" />
        </div>
        <p className="muted health-set__note">A suspended or expired business, or one at the strike threshold set under System settings, is also capped at “At risk”.</p>
      </fieldset>
    </form>
  );
}
