import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HISTORY_LOCK_TEXT, PERFORMANCE_METRICS, formatDateTime, historyHiddenCount } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import PerformancePanel from "../PerformancePanel.jsx";
import Modal from "./Modal.jsx";
import styles from "./catalog.module.css";
import perf from "../performance.module.css";

const TABS = [["overview", "Overview"], ["deals", "Deals"], ["history", "History"]];
const FIELD = { price: "Price", name: "Name", availability: "Availability", description: "Description", section: "Section", visible: "Showing", sale_price: "Sale price", stock_count: "Stock" };
const WHO = { seller: "You", admin: "EpicMKT", system: "System" };
const show = (v) => (v === null || v === undefined || v === "" ? "empty" : String(v));

function History({ itemId, onLeave }) {
  const q = useQuery({ queryKey: ["item-history", itemId], queryFn: () => api.getItemHistory(itemId), retry: false });
  if (q.isLoading) return <p className={perf.muted}>Loading…</p>;
  if (q.isError) return <p role="alert" className={perf.error}>{errorText(q.error)}</p>;
  const { entries, locked } = q.data;
  const hidden = historyHiddenCount(q.data);
  return (
    <div data-testid="history">
      {entries.length === 0 ? <p className={perf.muted}>No changes yet.</p> : (
        <ol className={perf.list}>
          {entries.map((e) => (
            <li key={e.id}>
              <strong>{FIELD[e.field] ?? e.field}</strong>: {show(e.old_value)} to {show(e.new_value)}
              <span className={perf.meta}> {WHO[e.actor_role] ?? e.actor_role}, <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time></span>
            </li>
          ))}
        </ol>
      )}
      {locked && (
        <p data-testid="history-locked" className={perf.lock}>
          {HISTORY_LOCK_TEXT} {hidden} more {hidden === 1 ? "entry is" : "entries are"} hidden. <Link className={ui.link} to="/business/subscription" onClick={onLeave}>See plans and upgrade</Link>
        </p>
      )}
    </div>
  );
}

function DealRows({ rows, name }) {
  if (!rows.length) return null;
  return (
    <ul className={perf.list}>
      {rows.map((r) => (
        <li key={r.id}>
          <strong>{name(r)}</strong>
          <span className={perf.meta}> {formatDateTime(r.starts_at)}{r.ends_at ? ` to ${formatDateTime(r.ends_at)}` : ""}</span>
          <div className={perf.nums}>{PERFORMANCE_METRICS.map((m) => <span key={m.key}>{m.label}: {r[m.key] ?? 0}</span>)}</div>
        </li>
      ))}
    </ul>
  );
}

function Deals({ itemId, onLeave }) {
  const q = useQuery({ queryKey: ["item-deals", itemId], queryFn: () => api.getItemDeals(itemId), retry: false });
  if (q.isLoading) return <p className={perf.muted}>Loading…</p>;
  if (q.isError) return <p role="alert" className={perf.error}>{errorText(q.error)}</p>;
  if (q.data.locked) {
    return (
      <p data-testid="deals-locked" className={perf.lock}>
        Seeing how each flash sale and offer performed is part of Premium. <Link className={ui.link} to="/business/subscription" onClick={onLeave}>See plans and upgrade</Link>
      </p>
    );
  }
  const { flash, offers } = q.data;
  if (!flash.length && !offers.length) return <p className={perf.muted}>No flash sales or offers on this item yet.</p>;
  return (
    <div data-testid="deals">
      <p className={perf.muted}>Counts are for the days each deal ran, so a day shared with normal selling counts in full.</p>
      {flash.length > 0 && <><h4>Flash sales</h4><DealRows rows={flash} name={(r) => r.headline || "Flash sale"} /></>}
      {offers.length > 0 && <><h4>Offers</h4><DealRows rows={offers} name={(r) => r.title} /></>}
    </div>
  );
}

// Overview, Deals and History for one item. `variants` is optional on the item and ignored when absent.
export default function ItemInsights({ item, onClose }) {
  const [tab, setTab] = useState("overview");
  if (!item) return null;
  const variants = Array.isArray(item.variants) ? item.variants : [];
  return (
    <Modal open onClose={onClose} title={item.name} labelId="insights-title" wide>
      <div role="tablist" aria-label="Item insights" className={perf.tabs}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`} className={`${perf.tab} ${tab === key ? perf.tabOn : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.insightsBody}>
        {tab === "overview" && (
          <>
            <PerformancePanel itemId={item.id} title="Views and taps" />
            {variants.length > 0 && <p className={perf.muted}>{variants.length} {variants.length === 1 ? "variant" : "variants"} on this item.</p>}
          </>
        )}
        {tab === "deals" && <Deals itemId={item.id} onLeave={onClose} />}
        {tab === "history" && <History itemId={item.id} onLeave={onClose} />}
      </div>
    </Modal>
  );
}
