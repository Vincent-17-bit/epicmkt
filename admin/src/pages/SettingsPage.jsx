import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { ACTION_TEXT } from "../api/errors.js";
import Button from "../components/Button.jsx";
import LoadError from "../components/LoadError.jsx";
import { useToast } from "../components/Toast.jsx";
import { friendlyError } from "../lib/businessDetail.js";

const FIELDS = ["graceDays", "strikeThreshold", "smsSender", "quietStart", "quietEnd"];

export default function SettingsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.getSettings(), retry: false });
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.data) setForm({ ...query.data, graceDays: String(query.data.graceDays), strikeThreshold: String(query.data.strikeThreshold) });
  }, [query.data]);

  const save = useMutation({
    mutationFn: (values) => api.saveSettings(values),
    onSuccess: (saved) => {
      setError("");
      client.setQueryData(["admin-settings"], saved);
      client.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.push({ message: "Settings saved." });
    },
    onError: (failure) => setError(ACTION_TEXT[failure?.code] ?? friendlyError(failure, "We could not save the settings. Try again.")),
  });

  if (query.isError) {
    return (
      <div className="page-shell">
        <section className="panel"><LoadError what="the settings" error={query.error} onRetry={query.refetch} /></section>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="page-shell">
        <section className="panel"><p>Loading…</p></section>
      </div>
    );
  }

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const changed = FIELDS.some((key) => String(form[key]) !== String(query.data[key]));
  const submit = (event) => {
    event.preventDefault();
    setError("");
    save.mutate({ ...form, graceDays: Number(form.graceDays), strikeThreshold: Number(form.strikeThreshold) });
  };

  return (
    <div className="page-shell">
      <form className="panel" onSubmit={submit}>
        <div className="panel__header">
          <h3>System settings</h3>
          <Button type="submit" variant="primary" disabled={!changed || save.isPending}>
            {save.isPending ? "Saving" : "Save changes"}
          </Button>
        </div>

        {error ? <p role="alert" className="admin-login__error">{error}</p> : null}

        <div className="settings-grid">
          <div className="setting-group">
            <label htmlFor="set-grace">Grace period (days)</label>
            <input id="set-grace" type="number" min="0" max="30" step="1" value={form.graceDays} onChange={set("graceDays")} />
            <span className="muted">For every business. Change one business from its own page.</span>
          </div>
          <div className="setting-group">
            <label htmlFor="set-strikes">Strike threshold</label>
            <input id="set-strikes" type="number" min="1" max="20" step="1" value={form.strikeThreshold} onChange={set("strikeThreshold")} />
          </div>
          <div className="setting-group">
            <label htmlFor="set-sender">SMS sender</label>
            <input id="set-sender" type="text" maxLength={11} value={form.smsSender} onChange={set("smsSender")} />
            <span className="muted">3 to 11 letters or numbers.</span>
          </div>
          <div className="setting-group">
            <label htmlFor="set-quiet-start">Quiet hours start (EAT)</label>
            <input id="set-quiet-start" type="time" value={form.quietStart} onChange={set("quietStart")} />
          </div>
          <div className="setting-group">
            <label htmlFor="set-quiet-end">Quiet hours end (EAT)</label>
            <input id="set-quiet-end" type="time" value={form.quietEnd} onChange={set("quietEnd")} />
            <span className="muted">Promotional SMS and email wait until then.</span>
          </div>
        </div>
      </form>
    </div>
  );
}
