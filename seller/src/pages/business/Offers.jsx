import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OfferChip, Offers as OfferTickets } from "@epicmkt/ui";
import {
  OFFER_DAYS, OFFER_DAY_NAMES, conditionsText, dealOf, formatDateTime, getUserTimeZone, kindsFor, localInputToUtcIso, offerHeadline, offerLabel, offerPhase, offerQuota, offerScope, recipesFor, utcToLocalInput, validateOffer, zoneLabel,
} from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import { serverNow } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import { useServerClock, useServerNow } from "../../lib/useServerNow.js";
import ui from "../../styles/ui.module.css";
import styles from "./offers.module.css";

const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
// Stored and sent as UTC. The seller types and reads times in their own time zone (same as the flash sale form).
const stamp = (iso) => `${formatDateTime(iso)} ${zoneLabel(iso)}`;
const toLocalInput = (ms) => utcToLocalInput(ms, getUserTimeZone());
const fromLocalInput = (value) => localInputToUtcIso(value, getUserTimeZone());
const LABELS = { title: "Offers", code: "Code", copy: "Copy code", copied: "Copied", endsIn: "Ends in", noEnd: "No end date", onlyNow: "Not available at this hour", openProduct: "Open" };
const PHASE = { live: "Live", scheduled: "Scheduled", paused: "Paused", ended: "Ended" };

const emptyForm = (scope = "product") => ({ scope, kind: "percent_off", config: { ...kindsFor(scope).percent_off.defaults }, conditions: {}, items: [], title: "", description: "", chipText: "", code: "", terms: "", start: "", end: "", minSpend: "", hoursOn: false, from: "16:00", to: "18:00" });

const fromRecipe = (r, scope) => ({
  ...emptyForm(scope), kind: r.kind, config: { ...(kindsFor(scope)[r.kind].defaults), ...r.config }, conditions: { ...(r.conditions ?? {}) },
  chipText: r.chipText ?? "", code: r.code ?? "", terms: r.terms ?? "", hoursOn: Boolean(r.conditions?.hours),
  from: r.conditions?.hours?.from ?? "16:00", to: r.conditions?.hours?.to ?? "18:00", recipe: r.key,
});

const fromOffer = (o) => {
  const scope = offerScope(o);
  const known = Boolean(kindsFor(scope)[o.kind]);
  return {
    scope, legacy: !o.kind, kind: known ? o.kind : "percent_off", config: known ? { ...o.config } : { ...kindsFor(scope).percent_off.defaults }, conditions: { ...o.conditions }, items: o.items.map((e) => ({ ...e })), title: o.title ?? "", description: o.description ?? "",
    chipText: o.chipText ?? "", code: o.code ?? "", terms: o.terms ?? "", start: o.startsAt && Date.parse(o.startsAt) > serverNow() ? toLocalInput(Date.parse(o.startsAt)) : "",
    end: o.endsAt ? toLocalInput(Date.parse(o.endsAt)) : "", minSpend: o.conditions?.minSpend ?? "", hoursOn: Boolean(o.conditions?.hours),
    from: o.conditions?.hours?.from ?? "16:00", to: o.conditions?.hours?.to ?? "18:00",
  };
};

const toInput = (f) => {
  const conditions = { ...f.conditions };
  if (f.hoursOn) conditions.hours = { from: f.from, to: f.to }; else delete conditions.hours;
  if (f.minSpend !== "" && f.minSpend !== null) conditions.minSpend = Number(f.minSpend); else delete conditions.minSpend;
  return {
    scope: f.scope, kind: f.kind, config: f.config, conditions, items: f.scope === "store" ? [] : f.items, title: f.title, description: f.description, chipText: f.chipText, code: f.code, terms: f.terms,
    startsAt: f.start ? fromLocalInput(f.start) : null, endsAt: f.end ? fromLocalInput(f.end) : null,
  };
};

function Field({ field, config, set }) {
  const kind = config;
  if (field.showFor && !field.showFor.includes(kind.rewardType)) return null;
  const id = `of-${field.key}`;
  const value = kind[field.key] ?? "";
  if (field.type === "select") {
    return (
      <div className={ui.field}>
        <label className={ui.label} htmlFor={id}>{field.label}</label>
        <select id={id} className={ui.input} value={value} onChange={(e) => set(field.key, e.target.value)}>{field.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
    );
  }
  if (field.type === "tiers") {
    const tiers = Array.isArray(value) ? value : [];
    const edit = (i, key, v) => set("tiers", tiers.map((t, j) => (j === i ? { ...t, [key]: v === "" ? "" : Number(v) } : t)));
    return (
      <fieldset className={styles.fieldset}>
        <legend>{field.label}</legend>
        {tiers.map((t, i) => (
          <div key={i} className={styles.tier}>
            <label className={ui.label}>Buy at least<input className={ui.input} type="number" min="2" value={t.qty} onChange={(e) => edit(i, "qty", e.target.value)} /></label>
            <label className={ui.label}>Percent off<input className={ui.input} type="number" min="1" max="99" value={t.percent} onChange={(e) => edit(i, "percent", e.target.value)} /></label>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => set("tiers", tiers.filter((_, j) => j !== i))} disabled={tiers.length <= 1}>Remove</button>
          </div>
        ))}
        {tiers.length < 4 && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => set("tiers", [...tiers, { qty: (tiers.at(-1)?.qty ?? 1) + 3, percent: Math.min(99, (tiers.at(-1)?.percent ?? 0) + 5) }])}>Add a tier</button>}
      </fieldset>
    );
  }
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>{field.label}{field.prefix ? ` (${field.prefix})` : ""}{field.suffix ? ` (${field.suffix})` : ""}</label>
      <input id={id} className={ui.input} type={field.type === "number" ? "number" : "text"} inputMode={field.type === "number" ? "numeric" : undefined} min={field.min} max={field.max} placeholder={field.placeholder} value={value}
        onChange={(e) => set(field.key, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
    </div>
  );
}

function Preview({ form, items, now }) {
  const picked = form.items.map((e) => ({ ...e, item: items.find((i) => i.id === e.itemId) })).filter((e) => e.item);
  const check = validateOffer({ ...toInput(form), startsAt: null }, { items, nowMs: now });
  const draft = check.ok ? { ...check.value, id: "draft" } : { scope: form.scope, kind: form.kind, config: form.config, conditions: toInput(form).conditions, chipText: form.chipText, code: form.code, terms: form.terms, description: form.description, title: form.title, items: form.items, id: "draft" };
  let label = "";
  let deal = null;
  try {
    label = offerLabel(draft);
    deal = dealOf(draft, picked.map((e) => ({ id: e.itemId, name: e.item.name, imageUrl: mediaUrl(e.item.imagePaths?.[0]), price: e.item.price, role: e.role })), now);
  } catch {
    label = "";
  }
  if (!label || /undefined|NaN/.test(label)) return <p className={ui.muted}>Fill in the details to see how customers will see this offer.</p>;
  return (
    <div className={styles.preview} data-testid="offer-preview">
      <div className={styles.chipDemo}><span className={styles.chipHost}><OfferChip offer={{ label, extra: 0 }} className={styles.chipPos} /></span><span className={ui.muted}>{form.scope === "store" ? "How the tag looks on your shop card" : "How the tag looks on a product"}</span></div>
      {deal && (form.scope === "store" || picked.length > 0) && <OfferTickets offers={[deal]} mode="preview" labels={LABELS} />}
    </div>
  );
}

function OfferForm({ initial, id, items, quota, now, onDone, onCancel }) {
  const [form, setForm] = useState(initial);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const store = form.scope === "store";
  const kinds = kindsFor(form.scope);
  const kind = kinds[form.kind];
  const setConfig = (key, value) => setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setKind = (k) => setForm((f) => ({ ...f, kind: k, config: { ...kinds[k].defaults }, items: k === "bundle" ? f.items : f.items.map((e) => ({ ...e, role: "main" })) }));
  const setScope = (scope) => setForm((f) => ({ ...emptyForm(scope), legacy: f.legacy, title: f.title, description: f.description, code: f.code, terms: f.terms, start: f.start, end: f.end, conditions: f.conditions, minSpend: f.minSpend, hoursOn: f.hoursOn, from: f.from, to: f.to }));
  const toggleItem = (itemId) => setForm((f) => ({ ...f, items: f.items.some((e) => e.itemId === itemId) ? f.items.filter((e) => e.itemId !== itemId) : [...f.items, { itemId, role: "main" }] }));
  const setRole = (itemId, role) => setForm((f) => ({ ...f, items: f.items.map((e) => (e.itemId === itemId ? { ...e, role } : e)) }));
  const toggleDay = (d) => setForm((f) => {
    const days = new Set(f.conditions.daysOfWeek ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    return { ...f, conditions: { ...f.conditions, daysOfWeek: OFFER_DAYS.filter((x) => days.has(x)) } };
  });
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const input = toInput(form);
    const check = validateOffer(input, { items, nowMs: serverNow(), existing: id ? { id } : null });
    if (!check.ok) return setError(errorText({ code: check.error === "invalid_kind" ? "invalid_offer_kind" : check.error }));
    setBusy(true);
    try {
      await api.saveOffer(id ?? null, input);
      await onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className={ui.card} onSubmit={submit} noValidate aria-labelledby="offer-form-title">
      <h2 id="offer-form-title">{id ? (store ? "Edit shop offer" : "Edit product offer") : (store ? "New shop offer" : "New product offer")}</h2>
      <p className={ui.muted}>{store ? "A shop offer applies to everything your shop sells. Customers see it on your shop page and your shop card." : "A product offer belongs to the products you pick. Customers see it on those products only."}</p>

      {form.legacy && (
        <fieldset className={styles.fieldset}>
          <legend>This offer applies to</legend>
          <div className={styles.kinds}>
            <label className={styles.radio}><input type="radio" name="of-scope" checked={store} onChange={() => setScope("store")} />My whole shop</label>
            <label className={styles.radio}><input type="radio" name="of-scope" checked={!store} onChange={() => setScope("product")} />Products I pick</label>
          </div>
        </fieldset>
      )}

      <fieldset className={styles.fieldset}>
        <legend>Start from a ready-made offer</legend>
        <div className={styles.recipes} role="group" aria-label="Offer ideas">
          {recipesFor(form.scope).map((r) => (
            <button key={r.key} type="button" className={`${styles.recipe} ${form.recipe === r.key ? styles.recipeOn : ""}`} aria-pressed={form.recipe === r.key}
              onClick={() => setForm((f) => ({ ...fromRecipe(r, f.scope), legacy: f.legacy, items: f.items }))}>
              <strong>{r.title}</strong>
              <span>{r.example}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Type of offer</legend>
        <div className={styles.kinds}>
          {Object.entries(kinds).map(([k, v]) => (
            <label key={k} className={styles.radio}><input type="radio" name="of-kind" checked={form.kind === k} onChange={() => setKind(k)} />{v.name}</label>
          ))}
        </div>
        <p className={ui.muted}>{kind.blurb}</p>
        <div className={styles.pair}>{kind.fields.map((f) => <Field key={f.key} field={f} config={form.config} set={setConfig} />)}</div>
      </fieldset>

      {!store && (
        <fieldset className={styles.fieldset}>
          <legend>Products in this offer</legend>
          <p className={ui.muted}>{form.kind === "bundle" ? "Pick the main product and what it is bought with. Only these products show the offer tag." : "Only the products you pick show the offer tag."}</p>
          <input className={ui.input} type="search" placeholder="Search your products" aria-label="Search your products" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className={styles.picker}>
            {shown.map((i) => {
              const entry = form.items.find((e) => e.itemId === i.id);
              return (
                <li key={i.id} className={styles.pick}>
                  <label className={styles.radio}><input type="checkbox" checked={Boolean(entry)} onChange={() => toggleItem(i.id)} />{i.name}<span className={ui.muted}>{i.price > 0 ? kes(i.price) : ""}</span></label>
                  {entry && form.kind === "bundle" && (
                    <select className={ui.input} aria-label={`Role of ${i.name}`} value={entry.role} onChange={(e) => setRole(i.id, e.target.value)}>
                      <option value="main">Main product</option>
                      <option value="with">Bought with it</option>
                    </select>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className={ui.muted}>No products found.</li>}
          </ul>
        </fieldset>
      )}

      <fieldset className={styles.fieldset}>
        <legend>When</legend>
        <div className={styles.pair}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="of-start">{`Starts (your time, ${zoneLabel(now)}, blank is now)`}</label>
            <input id="of-start" className={ui.input} type="datetime-local" value={form.start} min={toLocalInput(now)} onChange={(e) => setField("start", e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="of-end">Ends (blank has no end)</label>
            <input id="of-end" className={ui.input} type="datetime-local" value={form.end} min={toLocalInput(now)} onChange={(e) => setField("end", e.target.value)} />
          </div>
        </div>
        <div className={styles.kinds} role="group" aria-label="Days">
          {OFFER_DAYS.map((d) => <label key={d} className={styles.radio}><input type="checkbox" checked={(form.conditions.daysOfWeek ?? []).includes(d)} onChange={() => toggleDay(d)} />{OFFER_DAY_NAMES[d]}</label>)}
        </div>
        <p className={ui.muted}>Leave all days empty to run every day.</p>
        <label className={styles.radio}><input type="checkbox" checked={form.hoursOn} onChange={(e) => setField("hoursOn", e.target.checked)} />Only at certain hours (happy hour)</label>
        {form.hoursOn && (
          <div className={styles.pair}>
            <div className={ui.field}><label className={ui.label} htmlFor="of-from">From</label><input id="of-from" className={ui.input} type="time" value={form.from} onChange={(e) => setField("from", e.target.value)} /></div>
            <div className={ui.field}><label className={ui.label} htmlFor="of-to">To</label><input id="of-to" className={ui.input} type="time" value={form.to} onChange={(e) => setField("to", e.target.value)} /></div>
          </div>
        )}
        <label className={styles.radio}><input type="checkbox" checked={Boolean(form.conditions.newCustomersOnly)} onChange={(e) => setForm((f) => ({ ...f, conditions: { ...f.conditions, newCustomersOnly: e.target.checked || undefined } }))} />New customers only</label>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="of-min">{store ? "Minimum order, KES (optional)" : "Minimum spend, KES (optional)"}</label>
          <input id="of-min" className={ui.input} type="number" inputMode="numeric" min="1" value={form.minSpend} onChange={(e) => setField("minSpend", e.target.value)} />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Wording (all optional)</legend>
        <div className={styles.pair}>
          <div className={ui.field}><label className={ui.label} htmlFor="of-title">Offer name</label><input id="of-title" className={ui.input} maxLength={80} value={form.title} placeholder="Made from the offer if blank" onChange={(e) => setField("title", e.target.value)} /></div>
          <div className={ui.field}><label className={ui.label} htmlFor="of-chip">Tag text (2 to 22 characters)</label><input id="of-chip" className={ui.input} maxLength={22} value={form.chipText} placeholder="Made from the offer if blank" onChange={(e) => setField("chipText", e.target.value)} /></div>
          <div className={ui.field}><label className={ui.label} htmlFor="of-code">Promo code</label><input id="of-code" className={ui.input} maxLength={16} value={form.code} onChange={(e) => setField("code", e.target.value.toUpperCase())} /></div>
        </div>
        <div className={ui.field}><label className={ui.label} htmlFor="of-desc">Short description</label><input id="of-desc" className={ui.input} maxLength={200} value={form.description} onChange={(e) => setField("description", e.target.value)} /></div>
        <div className={ui.field}><label className={ui.label} htmlFor="of-terms">Terms</label><input id="of-terms" className={ui.input} maxLength={280} value={form.terms} onChange={(e) => setField("terms", e.target.value)} /></div>
      </fieldset>

      <section aria-label="Preview"><h3>Preview</h3><Preview form={form} items={items} now={now} /></section>

      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <button type="submit" className={ui.btn} disabled={busy || (!id && !quota.canCreate)}>{busy ? "Saving" : id ? "Save changes" : "Start offer"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function OfferRow({ offer, items, now, onEdit, onChanged }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const phase = offerPhase(offer, now);
  const store = offerScope(offer) === "store";
  const legacy = !offer.kind;
  const names = offer.items.map((e) => items.find((i) => i.id === e.itemId)?.name).filter(Boolean);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };
  const open = phase !== "ended";
  const remove = () => run(async () => {
    await api.deleteOffer(offer.id);
    setConfirming(false);
  });
  return (
    <li className={styles.row} data-testid="offer-row">
      <div className={styles.rowHead}>
        <strong>{offer.title ?? offerHeadline(offer)}</strong>
        <span className={`${ui.pill} ${phase === "live" && !legacy ? ui.tone_ok : ""}`}>{legacy ? "Needs update" : PHASE[phase]}</span>
      </div>
      <p className={styles.rowLine}><OfferChip offer={{ label: offerLabel(offer), extra: 0 }} className={styles.inlineChip} /> {legacy ? "Not shown to customers yet" : store ? "Whole shop" : names.join(", ") || "Product removed"}</p>
      {legacy && <p className={ui.muted}>Made before shop and product offers. Edit it, choose a type and save so customers can see it, or delete it.</p>}
      <p className={ui.muted}>
        {offer.startsAt && Date.parse(offer.startsAt) > now ? `Starts ${stamp(offer.startsAt)}. ` : ""}{offer.endsAt ? `Ends ${stamp(offer.endsAt)}.` : "No end date."}
        {conditionsText(offer) ? ` ${conditionsText(offer)}` : ""}
      </p>
      <div className={styles.rowActions}>
        {confirming ? (
          <>
            <button type="button" className={ui.btn} disabled={busy} onClick={remove}>Delete for good</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => onEdit(offer)}>Edit</button>
            {open && !legacy && (
              <>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => run(() => api.setOfferActive(offer.id, phase === "paused"))}>{phase === "paused" ? "Resume" : "Pause"}</button>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => run(() => api.endOffer(offer.id))}>{phase === "scheduled" ? "Cancel offer" : "End now"}</button>
              </>
            )}
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
          </>
        )}
      </div>
      {error && <p className={ui.error} role="alert">{error}</p>}
    </li>
  );
}

export default function Offers() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  useServerClock();
  const now = useServerNow();
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.listOffers });
  const items = useQuery({ queryKey: ["offer-items"], queryFn: api.listItems });
  const quota = useQuery({ queryKey: ["offer-quota"], queryFn: api.getOfferQuota });
  const refresh = () => Promise.all(["offers", "offer-items", "offer-quota", "shop-preview"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  useRealtime(["offers", "offer_items", "businesses"], refresh);

  const list = offers.data ?? [];
  const choices = useMemo(() => (items.data ?? []).filter((i) => !i.hiddenByAdmin), [items.data]);
  const current = list.filter((o) => phaseOpen(o, now));
  const past = list.filter((o) => !phaseOpen(o, now));
  const startNew = (scope) => setEditing({ form: emptyForm(scope) });
  const q = quota.data ?? offerQuota(list, null, now);

  return (
    <div className={ui.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1>Offers</h1>
          <p className={styles.quota} data-testid="offer-quota">Active now: {q.used} of {q.limit ?? "unlimited"}</p>
        </div>
        <div className={styles.rowActions}>
          <button type="button" className={ui.btn} onClick={() => startNew("store")} disabled={Boolean(editing) || !q.canCreate}>New shop offer</button>
          <button type="button" className={ui.btn} onClick={() => startNew("product")} disabled={Boolean(editing) || !q.canCreate || choices.length === 0}>New product offer</button>
        </div>
      </div>
      <p className={ui.muted}>A shop offer covers your whole shop, like free delivery over a set spend. A product offer belongs to the products you pick and shows its tag on those products only. Your shop card shows an Offer tag while either kind is running.</p>
      {!q.canCreate && <p className={ui.error} role="status">Your plan limit is reached. End an offer or upgrade to add another.</p>}
      {choices.length === 0 && !items.isLoading && <p className={ui.muted}>Add a product first to make a product offer. Shop offers need no products.</p>}

      {editing && (
        <OfferForm key={editing.id ?? "new"} initial={editing.form} id={editing.id} items={choices} quota={q} now={now} onCancel={() => setEditing(null)} onDone={async () => { setEditing(null); await refresh(); }} />
      )}

      {offers.isLoading ? (
        <p role="status">Loading</p>
      ) : offers.error ? (
        <p className={ui.error} role="alert">We could not load your offers. Check your connection and refresh.</p>
      ) : (
        <>
          <section aria-labelledby="of-current">
            <h2 id="of-current">Running, scheduled and paused</h2>
            {current.length === 0 ? <p className={ui.muted} data-testid="empty">No offers yet. Start a shop offer or a product offer from a ready-made idea.</p> : (
              <ul className={styles.list}>{current.map((o) => <OfferRow key={o.id} offer={o} items={choices} now={now} onChanged={refresh} onEdit={(x) => setEditing({ id: x.id, form: fromOffer(x) })} />)}</ul>
            )}
          </section>
          <section aria-labelledby="of-past">
            <h2 id="of-past">History</h2>
            {past.length === 0 ? <p className={ui.muted}>Ended offers show here.</p> : <ul className={styles.list}>{past.map((o) => <OfferRow key={o.id} offer={o} items={choices} now={now} onChanged={refresh} onEdit={(x) => setEditing({ id: x.id, form: fromOffer(x) })} />)}</ul>}
          </section>
        </>
      )}
    </div>
  );
}

const phaseOpen = (o, now) => offerPhase(o, now) !== "ended";
