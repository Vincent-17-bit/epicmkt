import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ZOOM_LENSES, ZOOM_SCALES, normalizeZoomSettings } from "@epicmkt/shared";
import { api } from "../../api/index.js";
import { ACTION_TEXT } from "../../api/errors.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { friendlyError } from "../../lib/businessDetail.js";

const same = (a, b) => a.enabled === b.enabled && a.scale === b.scale && a.lens === b.lens;

function Preview({ form }) {
  const lens = ZOOM_LENSES[form.lens];
  const side = 56 / form.scale;
  return (
    <div className="zoom-set__preview" aria-hidden="true" data-off={form.enabled ? undefined : ""}>
      <div className="zoom-set__photo">
        <span className="zoom-set__subject" />
        <span className="zoom-set__lens" style={{ width: `${side}%`, height: `${side}%`, background: `color-mix(in srgb, ${lens.fill} 18%, transparent)`, borderColor: lens.edge }} />
      </div>
      <div className="zoom-set__pane">
        <span className="zoom-set__subject zoom-set__subject--big" style={{ transform: `scale(${form.scale / 2})` }} />
      </div>
    </div>
  );
}

/** Settings > Photo zoom: one setting for every item page, written to the audit log. */
export default function ZoomSettings() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["admin-zoom-settings"], queryFn: () => api.getZoomSettings(), retry: false });
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.data) setForm(normalizeZoomSettings(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (values) => api.saveZoomSettings(values),
    onSuccess: (saved) => {
      setError("");
      client.setQueryData(["admin-zoom-settings"], saved);
      client.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.push({ message: "Photo zoom saved." });
    },
    onError: (failure) => setError(ACTION_TEXT[failure?.code] ?? friendlyError(failure, "We could not save the zoom settings. Try again.")),
  });

  if (query.isError) return <section className="panel"><LoadError what="the photo zoom settings" error={query.error} onRetry={query.refetch} /></section>;
  if (!form) return <section className="panel"><p>Loading…</p></section>;

  const changed = !same(form, normalizeZoomSettings(query.data));
  const submit = (event) => {
    event.preventDefault();
    setError("");
    save.mutate(form);
  };

  return (
    <form className="panel zoom-set" onSubmit={submit} aria-label="Photo zoom">
      <div className="panel__header">
        <h2 className="heading-sm">Photo zoom</h2>
        <Button type="submit" variant="primary" disabled={!changed || save.isPending}>{save.isPending ? "Saving" : "Save zoom"}</Button>
      </div>
      {error ? <p role="alert" className="admin-login__error">{error}</p> : null}
      <p className="muted">The magnifier on item photos, the same on every item page. Photos too small to stay sharp are zoomed less automatically.</p>

      <div className="zoom-set__body">
        <div className="zoom-set__controls">
          <label className="zoom-set__switch">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <span>Zoom on</span>
          </label>

          <fieldset disabled={!form.enabled}>
            <legend>Strength</legend>
            <div className="zoom-set__choices" role="radiogroup" aria-label="Zoom strength">
              {ZOOM_SCALES.map((scale) => (
                <label key={scale} className="zoom-set__choice">
                  <input type="radio" name="zoom-scale" checked={form.scale === scale} onChange={() => setForm({ ...form, scale })} />
                  <span>{scale}×</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={!form.enabled}>
            <legend>Lens colour</legend>
            <div className="zoom-set__choices" role="radiogroup" aria-label="Lens colour">
              {Object.entries(ZOOM_LENSES).map(([key, lens]) => (
                <label key={key} className="zoom-set__choice zoom-set__choice--lens">
                  <input type="radio" name="zoom-lens" checked={form.lens === key} onChange={() => setForm({ ...form, lens: key })} />
                  <span className="zoom-set__swatch" style={{ background: lens.fill, borderColor: lens.edge }} />
                  <span>{lens.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <Preview form={form} />
      </div>
    </form>
  );
}
