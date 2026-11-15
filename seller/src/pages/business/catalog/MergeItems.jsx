import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mergePreview, suggestAxes, similarKey } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./merge.module.css";

const kes = (n) => (Number.isFinite(Number(n)) ? `KES ${Number(n).toLocaleString("en-KE")}` : "");
const slugKey = (label) => String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
const until = (iso) => new Date(iso).toLocaleString("en-KE", { weekday: "short", hour: "numeric", minute: "2-digit" });
const startName = (group) => { const k = similarKey(group.items[0].name); return k ? k[0].toUpperCase() + k.slice(1) : group.items[0].name; };

// One group of similar items: pick which to combine, name the result, say what makes them different, see the price grid, then combine.
function GroupCard({ group, onDone }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(group.items.map((i) => i.id)));
  const [name, setName] = useState(() => startName(group));
  const [axes, setAxes] = useState(() => {
    const found = suggestAxes(group.items);
    return found.length ? found.map((a) => ({ key: a.key, label: a.label, labels: a.labels })) : [{ key: "option", label: "Option", labels: {} }];
  });
  const items = useMemo(() => group.items.filter((i) => picked.has(i.id)), [group, picked]);
  const first = items[0];
  const mutation = useMutation({
    mutationFn: () => api.mergeItems(items.map((i) => i.id), { name: name.trim(), axes: axes.map((a) => ({ key: a.key || slugKey(a.label) || "option", label: a.label.trim(), labels: Object.fromEntries(items.map((i) => [i.id, (a.labels[i.id] ?? "").trim()])) })) }),
    onSuccess: (res) => onDone({ ...res, name: name.trim(), count: items.length })
  });

  const filled = axes.every((a) => a.label.trim() && items.every((i) => (a.labels[i.id] ?? "").trim()));
  const combos = items.map((i) => axes.map((a) => (a.labels[i.id] ?? "").trim().toLowerCase()).join("|"));
  const clash = new Set(combos).size !== combos.length;
  const ready = items.length >= 2 && name.trim().length >= 2 && filled && !clash;
  const grid = filled && !clash ? mergePreview(items, axes, (a, i) => (a.labels[i.id] ?? "").trim()) : null;

  const setLabel = (axisIdx, id, text) => setAxes((all) => all.map((a, n) => (n === axisIdx ? { ...a, labels: { ...a.labels, [id]: text } } : a)));
  const toggle = (id) => setPicked((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <section className={ui.card} aria-labelledby={`g-${group.items[0].id}`}>
      <div className={styles.head}>
        <h2 id={`g-${group.items[0].id}`} className={styles.title}>{startName(group)}</h2>
        <p className={ui.muted}>{group.items.length} items that look alike</p>
      </div>
      <ul className={styles.names}>
        {group.items.map((i) => <li key={i.id}>{i.name} <span className={ui.muted}>{kes(i.price)}</span></li>)}
      </ul>
      {!open ? <button type="button" className={ui.btn} onClick={() => setOpen(true)}>Combine these</button> : (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (ready) mutation.mutate(); }}>
          <fieldset className={styles.fieldset}>
            <legend>Which items go into one</legend>
            {group.items.map((i) => (
              <label key={i.id} className={styles.check}><input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} /> {i.name} <span className={ui.muted}>{kes(i.price)}</span></label>
            ))}
          </fieldset>
          <label className={styles.field}>Name of the combined item
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          {axes.map((a, n) => (
            <fieldset key={n} className={styles.fieldset}>
              <legend>Option type {n + 1}</legend>
              <label className={styles.field}>What differs
                <input value={a.label} maxLength={30} onChange={(e) => setAxes((all) => all.map((x, k) => (k === n ? { ...x, label: e.target.value, key: x.key === "option" || !x.key || x.key === slugKey(x.label) ? slugKey(e.target.value) : x.key } : x)))} />
              </label>
              {items.map((i) => (
                <label key={i.id} className={styles.field}>{i.name}
                  <input value={a.labels[i.id] ?? ""} maxLength={40} aria-label={`${a.label || "Option"} for ${i.name}`} onChange={(e) => setLabel(n, i.id, e.target.value)} />
                </label>
              ))}
              {axes.length > 1 && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setAxes((all) => all.filter((_, k) => k !== n))}>Remove this option type</button>}
            </fieldset>
          ))}
          {axes.length < 2 && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setAxes((all) => [...all, { key: "", label: "", labels: {} }])}>Add another option type</button>}

          {clash && <p role="alert" className={styles.error}>Two items have the same value for every option. Give each its own combination.</p>}
          {grid && (
            <div className={styles.preview}>
              <h3>What shoppers will see</h3>
              <div className={styles.tableWrap}>
                <table>
                  <caption className={styles.sr}>Prices for each combination of {axes.map((a) => a.label).join(" and ")}</caption>
                  <thead><tr><th scope="col">{axes[0].label}{axes[1] ? ` / ${axes[1].label}` : ""}</th>{(axes[1] ? grid.cols : ["Price"]).map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                  <tbody>
                    {grid.rows.map((r) => (
                      <tr key={r}><th scope="row">{r}</th>
                        {grid.cols.map((c) => { const it = grid.cell(r, c); return <td key={c}>{it ? kes(it.salePrice != null && it.salePrice < it.price ? it.salePrice : it.price) : "Not sold"}</td>; })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={ui.muted}>“{first?.name}” keeps its link and becomes “{name.trim()}”. The photos of the other items move onto it, each one shown when its option is picked. The other items are hidden, and their old links open the combined item with the right option picked, so nothing you shared stops working. You can undo this for 24 hours.</p>
            </div>
          )}
          {mutation.isError && <p role="alert" className={styles.error}>{errorText(mutation.error)}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={!ready || mutation.isPending}>{mutation.isPending ? "Combining…" : `Combine ${items.length} items`}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Combine similar items: Bread 400g and Bread 800g become one Bread with a Weight option, old links keep working, undo for 24 hours. */
export default function MergeItems() {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["similar-groups"], queryFn: api.getSimilarGroups, retry: false });
  const recent = useQuery({ queryKey: ["recent-merges"], queryFn: api.listRecentMerges, retry: false });
  const [note, setNote] = useState("");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["similar-groups"] }), qc.invalidateQueries({ queryKey: ["recent-merges"] }), qc.invalidateQueries({ queryKey: ["catalog"] })]);
  const undo = useMutation({
    mutationFn: (id) => api.undoMerge(id),
    onSuccess: async () => { setNote("Undone. The items are back as they were."); await refresh(); }
  });

  return (
    <div className={ui.page}>
      <header className={ui.pageHead}>
        <p><Link to="/business/catalog">← Items</Link></p>
        <h1>Combine similar items</h1>
        <p className={ui.muted}>Items like “Bread 400g” and “Bread 800g” work better as one item with a choice of size. Shoppers see one product, and every old link or QR code you shared still works.</p>
      </header>

      <p role="status" aria-live="polite" className={styles.note}>{note}</p>

      {recent.data?.length > 0 && (
        <section className={ui.card} aria-labelledby="recent-h">
          <h2 id="recent-h">Combined recently</h2>
          <ul className={styles.recent}>
            {recent.data.map((m) => (
              <li key={m.id}>
                <span><strong>{m.name}</strong> from {m.count} items. <span className={ui.muted}>You can undo until {until(m.expiresAt)}.</span></span>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={undo.isPending} aria-label={`Undo ${m.name}`} onClick={() => undo.mutate(m.id)}>Undo</button>
              </li>
            ))}
          </ul>
          {undo.isError && <p role="alert" className={styles.error}>{errorText(undo.error)}</p>}
        </section>
      )}

      {groups.isPending && <p className={ui.muted} role="status">Looking for items that look alike…</p>}
      {groups.isError && (
        <div className={ui.card} role="alert"><p>{errorText(groups.error)}</p><button type="button" className={ui.btn} onClick={() => groups.refetch()}>Try again</button></div>
      )}
      {groups.data?.length === 0 && (
        <section className={ui.card}><h2>Nothing to combine</h2><p className={ui.muted}>No two of your items differ only by size, weight or colour. When you add “Rice 1kg” next to “Rice 2kg”, they will show up here.</p></section>
      )}
      {groups.data?.map((g) => (
        <GroupCard key={g.items.map((i) => i.id).join(",")} group={g} onDone={async (res) => { setNote(`Combined ${res.count} items into “${res.name}”. You can undo this for 24 hours.`); await refresh(); }} />
      ))}
    </div>
  );
}
