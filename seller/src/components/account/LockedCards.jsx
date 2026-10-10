import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryChangeQuote, formatPhoneKE, lockedProblem, pinValue, TOWNS, LIMITS } from "@epicmkt/shared";
import { cancelChange, requestChange, uploadDoc } from "../../api/index.js";
import { errorMessage } from "../../lib/errors.js";
import { checkDocFile } from "../../lib/media.js";
import { useSection } from "../../lib/useSection.js";
import MapPicker from "./MapPicker.jsx";
import SectionCard from "./SectionCard.jsx";
import { Chip, Dl, Field, FieldGroup, fmtDay, kes } from "./ui.jsx";

const rawPin = (v) => {
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(v ?? "");
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};
const pendingFor = (changes, field) => changes.find((c) => c.field === field && c.status === "pending");
const lastApproved = (changes, fields) =>
  changes.filter((c) => fields.includes(c.field) && c.status === "approved" && c.decided_at).map((c) => c.decided_at).sort().pop() ?? null;

/** "Pending approval" chip, what was asked for, and a Cancel request link. The old value keeps showing above it. */
export function PendingNotice({ change, display, children }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelChange(change.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["changes"] }),
  });
  return (
    <div className="sx-pending" role="status">
      <div className="sx-row sx-row--wrap">
        <Chip tone="warn">Pending approval</Chip>
        <span>Requested: <strong>{display(change.new_value)}</strong></span>
        <button type="button" className="sx-link" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          {cancel.isPending ? "Cancelling…" : "Cancel request"}
        </button>
      </div>
      {children}
      {cancel.isError && <p className="sx-error" role="alert">{errorMessage(cancel.error)}</p>}
    </div>
  );
}

/** One locked field: Save sends a change request; the current value stays live until it is approved. */
export function LockedCard({ id, title, description, field, changes, initialValue, current, editor, validate, display = (v) => v, pendingExtra, footerNote, saveHint }) {
  const qc = useQueryClient();
  const pending = pendingFor(changes, field);
  const check = useCallback((d) => {
    const message = validate ? validate(d.value) : lockedProblem(field, d.value);
    return message ? { value: message } : {};
  }, [validate, field]);
  const section = useSection({
    id,
    initial: { value: initialValue },
    validate: check,
    save: async (d) => {
      await requestChange(field, d.value);
      await qc.invalidateQueries({ queryKey: ["changes"] });
    },
  });

  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      locked
      lastUpdated={lastApproved(changes, [field])}
      neverLabel="Never changed"
      editing={section.editing}
      onEdit={section.start}
      onCancel={section.cancel}
      onSave={section.submit}
      canSave={section.dirty && !section.hasErrors}
      saving={section.saving}
      error={section.error}
      editDisabled={Boolean(pending)}
      editHint="Cancel the pending request first"
      footerNote={footerNote ?? saveHint ?? "Saving sends this to our team for approval. The current value stays live until then."}
      status={pending && <PendingNotice change={pending} display={display}>{pendingExtra?.(pending)}</PendingNotice>}
    >
      {section.editing ? editor({ value: section.draft.value, set: (v) => section.set("value", v), error: section.errors.value }) : current}
    </SectionCard>
  );
}

export function NameCard({ business, changes }) {
  return (
    <LockedCard
      id="name" title="Business name" field="name" changes={changes} initialValue={business.name}
      current={<p className="sx-value">{business.name}</p>}
      editor={({ value, set, error }) => (
        <Field label="Business name" error={error} hint="Use the name on your licence.">
          <input value={value} maxLength={100} onChange={(e) => set(e.target.value)} />
        </Field>
      )}
    />
  );
}

export function PhoneCard({ business, changes }) {
  return (
    <LockedCard
      id="phone" title="Main phone" field="phone" changes={changes} initialValue={formatPhoneKE(business.phone)}
      display={formatPhoneKE}
      current={<p className="sx-value">{formatPhoneKE(business.phone)}</p>}
      editor={({ value, set, error }) => (
        <Field label="Main phone number" error={error} hint="Customers call this number.">
          <input type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => set(e.target.value)} />
        </Field>
      )}
    />
  );
}

export function TownCard({ business, changes }) {
  const towns = TOWNS.some((t) => t.name === business.town) ? TOWNS.map((t) => t.name) : [business.town, ...TOWNS.map((t) => t.name)].filter(Boolean);
  return (
    <LockedCard
      id="town" title="Town" field="town" changes={changes} initialValue={business.town ?? ""}
      current={<p className="sx-value">{business.town ?? <span className="sx-muted">Not set</span>}{business.county && business.county !== business.town ? `, ${business.county}` : ""}</p>}
      editor={({ value, set, error }) => (
        <Field label="Town" error={error}>
          <select value={value} onChange={(e) => set(e.target.value)}>
            <option value="">Choose a town</option>
            {towns.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      )}
    />
  );
}

function QuotePreview({ business, categories, value }) {
  if (!value || value === business.category_id) return null;
  const from = categories.find((c) => c.id === business.category_id);
  const to = categories.find((c) => c.id === value);
  const oldPrice = from?.plans?.[business.plan_key]?.price;
  const newPrice = to?.plans?.[business.plan_key]?.price;
  if (!to || newPrice == null) return null;
  const quote = categoryChangeQuote({ oldPrice: oldPrice ?? newPrice, newPrice, paidUntil: business.paid_until });
  return quote.extraDueNow > 0 ? (
    <div className="sx-quote sx-quote--pay" role="status">
      <p><strong>{kes(quote.extraDueNow)} to pay first.</strong> {to.name} costs {kes(newPrice)} a month, {kes(newPrice - (oldPrice ?? newPrice))} more than {from?.name ?? "your category"}. The difference is prorated for the days left in your paid month{business.paid_until ? ` (to ${fmtDay(business.paid_until)})` : ""}.</p>
      <p className="sx-hint">We review your request once the payment is confirmed. From your next renewal you pay {kes(newPrice)} a month.</p>
    </div>
  ) : (
    <div className="sx-quote" role="status">
      <p><strong>Nothing to pay now.</strong> {to.name} costs {kes(newPrice)} a month, and that price applies from your next renewal.</p>
      <p className="sx-hint">You stay in {from?.name ?? "your current category"} until we approve the change.</p>
    </div>
  );
}

export function CategoryCard({ business, categories, changes }) {
  const current = categories.find((c) => c.id === business.category_id);
  const nameOf = (id) => categories.find((c) => c.id === id)?.name ?? id;
  const groups = [...new Set(categories.map((c) => c.grp))];
  const price = current?.plans?.[business.plan_key]?.price;
  return (
    <LockedCard
      id="category" title="Category" field="category_id" changes={changes} initialValue={business.category_id}
      display={nameOf}
      pendingExtra={(c) => (c.quote_kes > 0 ? <Chip tone="warn">Awaiting payment of {kes(c.quote_kes)}</Chip> : <p className="sx-hint">The new price applies from your next renewal.</p>)}
      current={<Dl rows={[["Category", current?.name ?? business.category_id], ["Your price", price != null ? `${kes(price)} a month` : null]]} />}
      footerNote="Saving sends this for approval. A dearer category needs the prorated difference paid first; a cheaper one applies from your next renewal."
      editor={({ value, set, error }) => (
        <>
          <Field label="Category" error={error}>
            <select value={value} onChange={(e) => set(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {categories.filter((c) => c.grp === g).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.plans?.[business.plan_key] ? ` · ${kes(c.plans[business.plan_key].price)}/month` : ""}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <QuotePreview business={business} categories={categories} value={value} />
        </>
      )}
    />
  );
}

export function LocationCard({ business, changes }) {
  const initial = pinValue(business.lat, business.lng) ?? "";
  const here = business.lat != null && business.lng != null ? { lat: business.lat, lng: business.lng } : null;
  return (
    <LockedCard
      id="location" title="Map pin" field="location" changes={changes} initialValue={initial}
      description="Where customers are sent for directions."
      display={(v) => v.replace(",", ", ")}
      current={<MapPicker value={here} height={220} idPrefix="pin-view" />}
      editor={({ value, set, error }) => (
        <FieldGroup label="Drag the pin to your front door" error={error}>
          <MapPicker value={rawPin(value)} onChange={(p) => set(pinValue(p.lat, p.lng))} idPrefix="pin-edit" />
        </FieldGroup>
      )}
    />
  );
}

const docName = (path) => path.split("/").pop().replace(/^\d+-/, "");

/** Licence number and documents: two locked fields in one card, each with its own pending request. */
export function LicenceCard({ business, changes }) {
  const qc = useQueryClient();
  const pendingLicence = pendingFor(changes, "licence");
  const pendingDocs = pendingFor(changes, "licence_docs");
  const savedDocs = business.licence_docs ?? [];
  const initial = { licence: business.licence ?? "", docs: savedDocs.map((p) => ({ path: p, name: docName(p) })) };
  const [docError, setDocError] = useState("");
  const picker = useRef(null);
  const key = (d) => d.path ?? `new:${d.file?.name}:${d.file?.size}`;

  const section = useSection({
    id: "licence",
    initial,
    isDirty: (d, i) => d.licence !== i.licence || d.docs.map(key).join("|") !== i.docs.map(key).join("|"),
    validate: (d) => {
      const e = {};
      if (!pendingLicence && d.licence !== initial.licence) {
        const m = lockedProblem("licence", d.licence);
        if (m) e.licence = m;
      }
      if (!pendingDocs && d.docs.map(key).join("|") !== initial.docs.map(key).join("|") && (d.docs.length < 1 || d.docs.length > LIMITS.licenceDocs)) e.docs = `Attach 1 to ${LIMITS.licenceDocs} documents`;
      return e;
    },
    save: async (d) => {
      if (!pendingLicence && d.licence !== initial.licence) await requestChange("licence", d.licence);
      if (!pendingDocs && d.docs.map(key).join("|") !== initial.docs.map(key).join("|")) {
        const paths = [];
        for (const doc of d.docs) paths.push(doc.path ?? (await uploadDoc({ businessId: business.id, file: doc.file })));
        await requestChange("licence_docs", JSON.stringify(paths));
      }
      await qc.invalidateQueries({ queryKey: ["changes"] });
    },
  });

  const addFiles = async (files) => {
    setDocError("");
    for (const file of files) {
      if (section.draft.docs.length >= LIMITS.licenceDocs) return setDocError(`You can attach up to ${LIMITS.licenceDocs} documents.`);
      const check = await checkDocFile(file);
      if (!check.ok) return setDocError(`${file.name}: ${check.message}`);
      section.setDraft((d) => (d.docs.length >= LIMITS.licenceDocs ? d : { ...d, docs: [...d.docs, { file, name: file.name }] }));
    }
  };

  const notices = (
    <>
      {pendingLicence && <PendingNotice change={pendingLicence} display={(v) => v} />}
      {pendingDocs && <PendingNotice change={pendingDocs} display={(v) => `${JSON.parse(v).length} document${JSON.parse(v).length === 1 ? "" : "s"}`} />}
    </>
  );

  return (
    <SectionCard
      id="licence-card"
      title="Licence details and documents"
      description="Your business permit or licence number and the documents that prove it."
      locked
      lastUpdated={lastApproved(changes, ["licence", "licence_docs"])}
      neverLabel="Never changed"
      editing={section.editing}
      onEdit={section.start}
      onCancel={section.cancel}
      onSave={section.submit}
      canSave={section.dirty && !section.hasErrors}
      saving={section.saving}
      error={section.error}
      editDisabled={Boolean(pendingLicence && pendingDocs)}
      editHint="Cancel the pending requests first"
      footerNote="Saving sends this to our team for approval. Your current details stay live until then. Documents are kept private."
      status={notices}
    >
      {section.editing ? (
        <>
          <Field label="Licence or permit number" error={section.errors.licence} hint={pendingLicence ? "A change to this is already waiting for approval." : undefined}>
            <input value={section.draft.licence} maxLength={60} disabled={Boolean(pendingLicence)} onChange={(e) => section.set("licence", e.target.value)} />
          </Field>
          <FieldGroup label="Documents" error={section.errors.docs || docError} hint={pendingDocs ? "A change to these is already waiting for approval." : `PDF, JPG, PNG or WebP, up to 10 MB each. Up to ${LIMITS.licenceDocs} files.`}>
            <ul className="sx-files">
              {section.draft.docs.map((d) => (
                <li key={key(d)}>
                  <span>{d.name}</span>
                  <button type="button" className="sx-link" disabled={Boolean(pendingDocs)} onClick={() => section.setDraft((x) => ({ ...x, docs: x.docs.filter((y) => key(y) !== key(d)) }))}>Remove</button>
                </li>
              ))}
              {!section.draft.docs.length && <li className="sx-muted">No documents attached</li>}
            </ul>
            <input ref={picker} type="file" hidden multiple accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Choose licence documents" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
            <button type="button" className="sx-btn" disabled={Boolean(pendingDocs) || section.draft.docs.length >= LIMITS.licenceDocs} onClick={() => picker.current.click()}>Add document</button>
          </FieldGroup>
        </>
      ) : (
        <Dl rows={[["Licence number", business.licence], ["Documents", savedDocs.length ? savedDocs.map(docName).join(", ") : null]]} />
      )}
    </SectionCard>
  );
}
