import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FLASH_QUICK, FLASH_MAX_MS, flashPhase, flashPrice, validateFlashSale } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { serverNow } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import { useServerClock, useServerNow } from "../../lib/useServerNow.js";
import ui from "../../styles/ui.module.css";
import styles from "./flash.module.css";

const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const toLocalInput = (ms) => new Date(ms + 3 * 3600000).toISOString().slice(0, 16);
const fromLocalInput = (value) => (value ? new Date(`${value}:00+03:00`).toISOString() : "");
const pad = (n) => String(n).padStart(2, "0");

export function remainingText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const REASONS = { time: "Ended on time", seller: "Ended by you", admin: "Stopped by EpicMKT", item_removed: "Item removed", subscription: "Listing not active" };
const DISCOUNTS = [["percent", "Percent off"], ["amount_off", "Amount off"], ["sale_price", "Fixed sale price"]];

function SaleForm({ items, quota, onDone, onCancel }) {
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [headline, setHeadline] = useState("");
  const [note, setNote] = useState("");
  const [afterEnd, setAfterEnd] = useState("keep");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const item = items.find((i) => i.id === itemId);
  const live = schedule ? start : "";
  const startMs = live ? Date.parse(fromLocalInput(live)) : serverNow();
  const price = item && Number(value) > 0 ? flashPrice(type, Number(value), item.price) : null;

  const quick = (ms) => setEnd(toLocalInput(Math.max(startMs, serverNow()) + ms));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!item) return setError(errorText({ code: "item_not_found" }));
    const check = validateFlashSale({ itemPrice: item.price, discountType: type, discountValue: value, startsAt: live ? fromLocalInput(live) : null, endsAt: fromLocalInput(end), headline, quantityNote: note, afterEnd }, serverNow());
    if (!check.ok) return setError(errorText({ code: check.error }));
    setBusy(true);
    try {
      await api.createFlashSale({ itemId, ...check.value });
      await onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className={ui.card} onSubmit={submit} noValidate aria-labelledby="flash-form-title">
      <h2 id="flash-form-title">New flash sale</h2>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="fs-item">Item</label>
        <select id="fs-item" className={ui.input} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Choose an item</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({kes(i.price)})</option>)}
        </select>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Discount</legend>
        <div className={styles.radios}>
          {DISCOUNTS.map(([key, label]) => (
            <label key={key} className={styles.radio}><input type="radio" name="fs-type" checked={type === key} onChange={() => setType(key)} />{label}</label>
          ))}
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="fs-value">{type === "percent" ? "Percent (1 to 99)" : type === "amount_off" ? "Amount off (KES)" : "Sale price (KES)"}</label>
          <input id="fs-value" className={ui.input} type="number" inputMode="numeric" min="1" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        {price !== null && <p className={styles.preview} data-testid="fs-preview">Customers pay {kes(price)} instead of {kes(item.price)}</p>}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>When</legend>
        <div className={styles.radios}>
          <label className={styles.radio}><input type="radio" name="fs-when" checked={!schedule} onChange={() => setSchedule(false)} />Start now</label>
          <label className={styles.radio}><input type="radio" name="fs-when" checked={schedule} onChange={() => setSchedule(true)} />Schedule</label>
        </div>
        <div className={styles.pair}>
          {schedule && (
            <div className={ui.field}>
              <label className={ui.label} htmlFor="fs-start">Starts (Nairobi time)</label>
              <input id="fs-start" className={ui.input} type="datetime-local" value={start} min={toLocalInput(serverNow())} onChange={(e) => setStart(e.target.value)} />
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="fs-end">Ends (Nairobi time)</label>
            <input id="fs-end" className={ui.input} type="datetime-local" value={end} min={toLocalInput(startMs)} max={toLocalInput(startMs + FLASH_MAX_MS)} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className={styles.quick} role="group" aria-label="Quick durations">
          {FLASH_QUICK.map((q) => <button key={q.key} type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => quick(q.ms)}>{q.label}</button>)}
        </div>
      </fieldset>

      <div className={styles.pair}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="fs-headline">Headline (optional)</label>
          <input id="fs-headline" className={ui.input} value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="fs-note">Quantity note (optional)</label>
          <input id="fs-note" className={ui.input} value={note} maxLength={80} placeholder="While stock lasts" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>When the sale ends</legend>
        <div className={styles.radios}>
          <label className={styles.radio}><input type="radio" name="fs-after" checked={afterEnd === "keep"} onChange={() => setAfterEnd("keep")} />Keep the item at its normal price</label>
          <label className={styles.radio}><input type="radio" name="fs-after" checked={afterEnd === "unlist"} onChange={() => setAfterEnd("unlist")} />Hide the item</label>
        </div>
      </fieldset>

      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <button type="submit" className={ui.btn} disabled={busy || !quota.canCreate}>{busy ? "Saving" : "Start flash sale"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function SaleRow({ sale, now, onChanged }) {
  const phase = flashPhase(sale, now);
  const open = phase === "live" || phase === "scheduled";
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [extending, setExtending] = useState(false);
  const [headline, setHeadline] = useState(sale.headline ?? "");
  const [note, setNote] = useState(sale.quantityNote ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (job) => {
    setError("");
    setBusy(true);
    try {
      await job();
      await onChanged();
      setEditing(false);
      setConfirming(false);
      setExtending(false);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  const discount = sale.discountType === "percent" ? `${sale.discountValue}% off` : sale.discountType === "amount_off" ? `${kes(sale.discountValue)} off` : `Sale price ${kes(sale.discountValue)}`;
  const price = sale.regularPrice ? flashPrice(sale.discountType, sale.discountValue, sale.regularPrice) : null;

  return (
    <li className={styles.row} data-phase={phase} data-testid="flash-sale">
      <div>
        <h2>
          <span>{sale.itemName}</span>
          <span className={`${ui.pill} ${phase === "live" ? ui.tone_ok : phase === "scheduled" ? ui.tone_info : ui.tone_warning}`}>{phase === "live" ? "Live" : phase === "scheduled" ? "Scheduled" : phase === "cancelled" ? "Cancelled" : "Ended"}</span>
        </h2>
        <p>{discount}{price !== null && ` (${kes(price)})`}{sale.headline && `, ${sale.headline}`}</p>
        {sale.quantityNote && <p className={styles.note}>{sale.quantityNote}</p>}
        {phase === "live" && <p>Ends in <span className={styles.timer} data-testid="flash-timer">{remainingText(Date.parse(sale.endsAt) - now)}</span></p>}
        {phase === "scheduled" && <p>Starts {stamp(sale.startsAt)} and runs until {stamp(sale.endsAt)}</p>}
        {!open && <p className={styles.note}>{stamp(sale.startsAt)} to {stamp(sale.endedAt ?? sale.endsAt)}. {REASONS[sale.endedReason] ?? ""}</p>}
      </div>

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => api.updateFlashSale(sale.id, { headline, quantityNote: note })); }} className={styles.pair}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`h-${sale.id}`}>Headline</label>
            <input id={`h-${sale.id}`} className={ui.input} value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`n-${sale.id}`}>Quantity note</label>
            <input id={`n-${sale.id}`} className={ui.input} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>Save</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      {confirming && (
        <div className={styles.confirm} role="alertdialog" aria-label={`End ${sale.itemName} flash sale`}>
          <p>{phase === "scheduled" ? "Cancel this sale before it starts?" : "End this sale now? Customers will see the normal price straight away."}</p>
          <div className={styles.actions}>
            <button type="button" className={ui.btn} disabled={busy} onClick={() => run(() => api.endFlashSale(sale.id))}>{phase === "scheduled" ? "Cancel sale" : "End sale"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setConfirming(false)}>Keep it running</button>
          </div>
        </div>
      )}

      {extending && (
        <div className={styles.confirm} role="group" aria-label={`Extend ${sale.itemName} flash sale`}>
          <p>Add time to this sale. It currently {phase === "scheduled" ? "runs until" : "ends"} {stamp(sale.endsAt)}. A sale can run for 7 days at most.</p>
          <div className={styles.actions}>
            {FLASH_QUICK.slice(0, 3).map((q) => (
              <button key={q.key} type="button" className={ui.btn} disabled={busy} onClick={() => run(() => api.extendFlashSale(sale.id, new Date(Date.parse(sale.endsAt) + q.ms).toISOString()))}>Add {q.label}</button>
            ))}
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setExtending(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className={ui.error} role="alert">{error}</p>}
      {open && !editing && !confirming && !extending && (
        <div className={styles.actions}>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setEditing(true)} aria-label={`Edit ${sale.itemName} headline and note`}>Edit text</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setExtending(true)} aria-label={`Extend ${sale.itemName} flash sale`}>Extend</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setConfirming(true)} aria-label={`End ${sale.itemName} flash sale early`}>{phase === "scheduled" ? "Cancel" : "End early"}</button>
        </div>
      )}
    </li>
  );
}

export default function Flash() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  useServerClock();
  const now = useServerNow();
  const sales = useQuery({ queryKey: ["flash-sales"], queryFn: api.listFlashSales });
  const items = useQuery({ queryKey: ["flash-items"], queryFn: api.listItems });
  const quota = useQuery({ queryKey: ["flash-quota"], queryFn: api.getFlashQuota });
  const refresh = () => Promise.all(["flash-sales", "flash-items", "flash-quota"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  useRealtime(["flash_sales", "businesses"], refresh);

  const list = sales.data ?? [];
  const running = useMemo(() => new Set(list.filter((s) => ["live", "scheduled"].includes(flashPhase(s, now))).map((s) => s.itemId)), [list, now]);
  const choices = (items.data ?? []).filter((i) => i.visible && !i.hiddenByAdmin && !["out_of_stock", "unavailable"].includes(i.availability) && i.price > 0 && ["fixed", "from"].includes(i.priceType) && !running.has(i.id));
  const current = list.filter((s) => ["live", "scheduled"].includes(flashPhase(s, now))).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
  const past = list.filter((s) => !["live", "scheduled"].includes(flashPhase(s, now)));
  const q = quota.data;

  const stale = list.some((s) => ["live", "scheduled"].includes(s.status) && Date.parse(s.endsAt) <= now);
  useEffect(() => {
    if (!stale) return undefined;
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [stale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={ui.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1>Flash sales</h1>
          {q && (
            <p className={styles.quota} data-testid="flash-quota">
              <span>Running now: {q.concurrentUsed} of {q.concurrentLimit ?? "unlimited"}</span>
              <span>This month: {q.monthlyUsed} of {q.monthlyLimit ?? "unlimited"}</span>
            </p>
          )}
        </div>
        <button type="button" className={ui.btn} onClick={() => setCreating(true)} disabled={creating || !q?.canCreate || choices.length === 0}>New flash sale</button>
      </div>
      <p className={ui.muted}>A flash sale appears to customers only while it runs and disappears everywhere the moment it ends.</p>
      {q && !q.canCreate && <p className={ui.error} role="status">Your plan limit is reached. You can start another when a sale ends or next month.</p>}
      {q?.canCreate && choices.length === 0 && !items.isLoading && <p className={ui.muted} data-testid="no-items">You have no items that can go on sale right now. Items must be listed, in stock and priced.</p>}

      {creating && q && <SaleForm items={choices} quota={q} onDone={async () => { setCreating(false); await refresh(); }} onCancel={() => setCreating(false)} />}

      {sales.isLoading ? (
        <p role="status">Loading</p>
      ) : sales.error ? (
        <p className={ui.error} role="alert">We could not load your flash sales. Check your connection and refresh.</p>
      ) : (
        <>
          <section aria-labelledby="fs-current">
            <h2 id="fs-current">Running and scheduled</h2>
            {current.length === 0 ? <p className={ui.muted} data-testid="empty">No flash sales running.</p> : (
              <ul className={styles.list}>{current.map((s) => <SaleRow key={s.id} sale={s} now={now} onChanged={refresh} />)}</ul>
            )}
          </section>
          <section aria-labelledby="fs-past">
            <h2 id="fs-past">History</h2>
            {past.length === 0 ? <p className={ui.muted}>Past sales will show here.</p> : (
              <ul className={styles.list}>{past.map((s) => <SaleRow key={s.id} sale={s} now={now} onChanged={refresh} />)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
