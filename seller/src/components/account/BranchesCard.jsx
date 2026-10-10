import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LIMITS, TOWNS, clock12, formatPhoneKE, isValidPhoneKE } from "@epicmkt/shared";
import { deleteBranch, saveBranch } from "../../api/index.js";
import { errorMessage } from "../../lib/errors.js";
import { ConfirmDialog } from "../../lib/guard.jsx";
import { useSection } from "../../lib/useSection.js";
import MapPicker from "./MapPicker.jsx";
import { Field, FieldGroup, fmtDateTime, PremiumChip, UpgradePrompt } from "./ui.jsx";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const cleanHours = (hours) => Object.fromEntries(Object.entries(hours).filter(([, v]) => Array.isArray(v) && v[0] && v[1]));

function hoursSummary(hours = {}) {
  const open = WEEK.filter((d) => hours[d]);
  if (!open.length) return "Hours not set";
  const first = hours[open[0]];
  const same = open.every((d) => hours[d][0] === first[0] && hours[d][1] === first[1]);
  return same ? `${open.length === 7 ? "Every day" : open.map((d) => NAMES[d].slice(0, 3)).join(", ")} · ${clock12(first[0])} to ${clock12(first[1])}` : `Open ${open.length} days a week`;
}

function HoursEditor({ value, onChange, error }) {
  return (
    <FieldGroup label="Opening hours" error={error} hint="Leave a day unticked if the branch is closed.">
      <div className="sx-hours">
        {WEEK.map((d) => {
          const v = value[d];
          return (
            <div key={d} className="sx-hours__row">
              <label className="sx-check"><input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange({ ...value, [d]: e.target.checked ? ["08:00", "17:00"] : undefined })} /> {NAMES[d]}</label>
              {v ? (
                <span className="sx-row">
                  <input type="time" aria-label={`${NAMES[d]} opens`} value={v[0]} onChange={(e) => onChange({ ...value, [d]: [e.target.value, v[1]] })} />
                  <span>to</span>
                  <input type="time" aria-label={`${NAMES[d]} closes`} value={v[1]} onChange={(e) => onChange({ ...value, [d]: [v[0], e.target.value] })} />
                </span>
              ) : <span className="sx-muted">Closed</span>}
            </div>
          );
        })}
      </div>
    </FieldGroup>
  );
}

function BranchForm({ branch, businessId, onDone }) {
  const qc = useQueryClient();
  const towns = TOWNS.map((t) => t.name);
  const initial = {
    name: branch?.name ?? "", address: branch?.address ?? "", town: branch?.town ?? "", phone: branch?.phone ? formatPhoneKE(branch.phone) : "",
    lat: branch?.lat ?? null, lng: branch?.lng ?? null, hours: branch?.hours ?? {},
  };
  const s = useSection({
    id: `branch-${branch?.id ?? "new"}`, initial, startEditing: true,
    validate: useCallback((d) => {
      const e = {};
      const n = d.name.trim();
      if (n.length < 2 || n.length > 80) e.name = "Use 2 to 80 characters";
      if (d.phone.trim() && !isValidPhoneKE(d.phone)) e.phone = "Enter a Kenyan number, for example 0712 345 678";
      if (d.address.length > LIMITS.addressLine) e.address = `Use up to ${LIMITS.addressLine} characters`;
      if (Object.values(d.hours).some((v) => Array.isArray(v) && (!v[0] || !v[1] || v[0] === v[1]))) e.hours = "Give each open day an opening and a closing time";
      return e;
    }, []),
    save: async (d) => {
      await saveBranch({
        id: branch?.id, business_id: businessId, name: d.name.trim(), address: d.address.trim() || null, town: d.town || null,
        phone: d.phone.trim() || null, lat: d.lat, lng: d.lng, hours: cleanHours(d.hours), sort: branch?.sort ?? 0,
      });
      await qc.invalidateQueries({ queryKey: ["branches"] });
      onDone();
    },
  });
  return (
    <form className="sx-subcard" onSubmit={(e) => { e.preventDefault(); s.submit(); }} aria-label={branch ? `Edit ${branch.name}` : "New branch"}>
      <Field label="Branch name" error={s.errors.name}><input value={s.draft.name} maxLength={80} onChange={(e) => s.set("name", e.target.value)} /></Field>
      <Field label="Address or landmark" error={s.errors.address}><input value={s.draft.address} maxLength={LIMITS.addressLine} onChange={(e) => s.set("address", e.target.value)} /></Field>
      <div className="sx-grid2">
        <Field label="Town"><select value={s.draft.town} onChange={(e) => s.set("town", e.target.value)}><option value="">Choose a town</option>{towns.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Branch phone" error={s.errors.phone}><input type="tel" inputMode="tel" value={s.draft.phone} onChange={(e) => s.set("phone", e.target.value)} /></Field>
      </div>
      <FieldGroup label="Branch location on the map">
        <MapPicker value={s.draft.lat != null ? { lat: s.draft.lat, lng: s.draft.lng } : null} onChange={(p) => s.setDraft((d) => ({ ...d, lat: p.lat, lng: p.lng }))} height={220} idPrefix={`branch-${branch?.id ?? "new"}`} />
      </FieldGroup>
      <HoursEditor value={s.draft.hours} onChange={(h) => s.set("hours", h)} error={s.errors.hours} />
      {s.error && <p className="sx-error" role="alert">{s.error}</p>}
      <div className="sx-row sx-row--end">
        <button type="button" className="sx-btn" onClick={() => { s.cancel(); onDone(); }} disabled={s.saving}>Cancel</button>
        <button type="submit" className="sx-btn sx-btn--primary" disabled={!s.dirty || s.hasErrors || s.saving}>{s.saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export default function BranchesCard({ business, branches, upgradePrice }) {
  const qc = useQueryClient();
  const premium = business.plan_key === "premium";
  const [open, setOpen] = useState(null); // "new" | branch id | null
  const [removing, setRemoving] = useState(null);
  const remove = useMutation({
    mutationFn: (id) => deleteBranch(id),
    onSuccess: () => { setRemoving(null); return qc.invalidateQueries({ queryKey: ["branches"] }); },
  });
  const latest = branches.map((b) => b.updated_at).sort().pop() ?? null;
  const full = branches.length >= LIMITS.branches;

  return (
    <section className="sx-card" id="branches" aria-labelledby="branches-title">
      <header className="sx-card__head">
        <div>
          <h2 id="branches-title">Branches <PremiumChip /></h2>
          <p className="sx-muted">Other places customers can find you. Up to {LIMITS.branches} branches.</p>
        </div>
        {premium && open !== "new" && <button type="button" className="sx-btn" onClick={() => setOpen("new")} disabled={full} title={full ? "You have reached the limit" : undefined}>Add branch</button>}
      </header>
      {!premium && <UpgradePrompt price={upgradePrice}>Multiple branches are part of the Premium plan.</UpgradePrompt>}
      <div className="sx-card__body">
        {open === "new" && <BranchForm businessId={business.id} onDone={() => setOpen(null)} />}
        {!branches.length && open !== "new" && <p className="sx-muted">{premium ? "No branches yet." : "You have no branches."}</p>}
        <ul className="sx-branches">
          {branches.map((b) => (
            <li key={b.id}>
              {open === b.id ? (
                <BranchForm branch={b} businessId={business.id} onDone={() => setOpen(null)} />
              ) : (
                <div className="sx-branch">
                  <div>
                    <strong>{b.name}</strong>
                    <p className="sx-muted">{[b.address, b.town].filter(Boolean).join(", ") || "No address"}{b.phone ? ` · ${formatPhoneKE(b.phone)}` : ""}</p>
                    <p className="sx-muted">{hoursSummary(b.hours)}</p>
                  </div>
                  <div className="sx-row">
                    <button type="button" className="sx-btn" onClick={() => setOpen(b.id)} aria-label={`Edit ${b.name}`}>Edit</button>
                    <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setRemoving(b)} aria-label={`Delete ${b.name}`}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      {full && premium && <p className="sx-hint">You have {LIMITS.branches} of {LIMITS.branches} branches. Delete one to add another.</p>}
      {remove.isError && <p className="sx-error" role="alert">{errorMessage(remove.error)}</p>}
      <p className="sx-card__meta">Last updated: {latest ? fmtDateTime(latest) : "Not edited yet"}</p>
      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`} body="This branch will disappear from your page. You can add it again later."
          confirm="Delete branch" cancel="Keep it" onCancel={() => setRemoving(null)} onConfirm={() => remove.mutate(removing.id)}
        />
      )}
    </section>
  );
}
