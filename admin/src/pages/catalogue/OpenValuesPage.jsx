// A18: review the shared dictionary of typed materials, colours and brands.
// A seller's new value works at once; here an admin approves it, fixes its spelling (rename), or folds it into the right one (merge).
// Rename and merge update every item that uses the value.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import Pager from "../../components/Pager.jsx";
import Tabs from "../../components/Tabs.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { VALUE_KINDS, VALUE_TABS, itemsText, kindLabel, parseTags, valueError } from "../../lib/openValues.js";

const PAGE_SIZE = 50;
const KEY = "admin-open-values";

function Swatch({ hex }) {
  if (!hex) return null;
  return <span role="img" aria-label={`Shade ${hex}`} title={hex} style={{ display: "inline-block", inlineSize: "1rem", blockSize: "1rem", marginInlineEnd: "0.4rem", verticalAlign: "-0.15rem", borderRadius: "50%", border: "1px solid currentColor", background: hex }} />;
}

function useValueMutation(fn, doneText, onClose) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      toast.push({ message: doneText(result) });
      queryClient.invalidateQueries({ queryKey: [KEY] });
      onClose?.();
    },
  });
}

function RenameDialog({ value, onClose }) {
  const [label, setLabel] = useState(value.label);
  const save = useValueMutation(() => api.renameOptionValue(value.id, label.trim()),
    (r) => (r.itemsUpdated ? `Renamed. ${itemsText(r.itemsUpdated)} now show “${r.label}”.` : `Renamed to “${r.label}”.`), onClose);
  const ready = label.trim().length > 0 && label.trim() !== value.label;
  return (
    <Modal title={`Rename ${value.label}`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}>
        <label className="field">New spelling
          <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <p className="muted">{value.uses > 0 ? `${itemsText(value.uses)} use this value and will show the new spelling.` : "No items use this value yet."} Buyers see it exactly as written here.</p>
        {save.isError ? <p className="modal__error" role="alert">{valueError(save.error)}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready || save.isPending}>{save.isPending ? "Saving" : "Rename"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MergeDialog({ value, onClose }) {
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [target, setTarget] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQuery(typed), 200); return () => clearTimeout(t); }, [typed]);
  const { data, isLoading, isError } = useQuery({
    queryKey: [KEY, "targets", value.kind, query],
    queryFn: () => api.listOptionValues({ kind: value.kind, query, limit: 20 }),
  });
  const options = (data?.values ?? []).filter((v) => v.status !== "merged" && v.id !== value.id);
  const save = useValueMutation(() => api.mergeOptionValue(value.id, target.id),
    (r) => `Merged into “${r.label}”. ${itemsText(r.itemsUpdated ?? 0)} updated.`, onClose);
  return (
    <Modal title={`Merge ${value.label}`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); if (target) save.mutate(); }}>
        <p className="muted">Pick the {kindLabel(value.kind).toLowerCase()} that “{value.label}” really is. Items that use it will show that spelling, and anyone typing the old spelling will get the one you choose.</p>
        <label className="field">Find a value
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Merge into</legend>
          {isLoading ? <span className="skeleton" /> : isError ? <p className="modal__error" role="alert">Could not load values.</p> : options.length === 0 ? <p className="muted">No other {kindLabel(value.kind).toLowerCase()} values match.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxBlockSize: "14rem", overflowY: "auto" }}>
              {options.map((o) => (
                <li key={o.id}>
                  <label style={{ display: "flex", gap: "0.6rem", alignItems: "center", minBlockSize: "2.75rem" }}>
                    <input type="radio" name="merge-target" checked={target?.id === o.id} onChange={() => setTarget(o)} />
                    <span><Swatch hex={o.hex} />{o.label} <span className="muted">· {o.status === "approved" ? "approved" : "waiting"} · {itemsText(o.uses)}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {target && <p role="status">“{value.label}” ({itemsText(value.uses)}) will become “{target.label}”. This cannot be undone.</p>}
        {save.isError ? <p className="modal__error" role="alert">{valueError(save.error)}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!target || save.isPending}>{save.isPending ? "Merging" : "Merge"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DetailsDialog({ value, onClose }) {
  const [tags, setTags] = useState(value.tags.join(", "));
  const [hex, setHex] = useState(value.hex ?? "");
  const isColor = value.kind === "color";
  const save = useValueMutation(() => api.updateOptionValue(value.id, { tags: parseTags(tags), ...(isColor ? { hex: hex.trim() || null } : {}) }), () => "Saved.", onClose);
  return (
    <Modal title={`Tags and shade: ${value.label}`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="field">Tags (separate with commas)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="precious-metal, jewellery" autoFocus />
        </label>
        {isColor && (
          <label className="field">Shade (optional)
            <input value={hex} maxLength={7} onChange={(e) => setHex(e.target.value)} placeholder="#7b1e3a" spellCheck={false} />
            <span className="muted">With a shade, buyers see a colour swatch. Without one, they see the name.</span>
          </label>
        )}
        {save.isError ? <p className="modal__error" role="alert">{valueError(save.error)}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>{save.isPending ? "Saving" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function OpenValuesPage() {
  const { can, why } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [kind, setKind] = useState("");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState(null);   // { type: "rename" | "merge" | "details", value }
  const canReview = can("values.review");

  useEffect(() => { const t = setTimeout(() => { setQuery(typed); setPage(0); }, 250); return () => clearTimeout(t); }, [typed]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [KEY, tab, kind, query, page],
    queryFn: () => api.listOptionValues({ status: tab === "all" ? null : tab, kind: kind || null, query, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });
  const rows = data?.values ?? [];

  const approve = useMutation({
    mutationFn: (v) => api.approveOptionValue(v.id),
    onSuccess: (v) => { toast.push({ message: `Approved “${v.label}”.` }); queryClient.invalidateQueries({ queryKey: [KEY] }); },
    onError: (e) => toast.push({ message: valueError(e), tone: "error" }),
  });

  const panelId = "open-values";
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Open values</h2>
        </div>
        <p className="muted">Sellers can type a material, colour or brand that is not listed. It works for them at once and appears here. Approve it, fix its spelling, or merge it into the right value. “Samsung”, “SAMSUNG” and “samsung” are always one value.</p>

        <Tabs tabs={VALUE_TABS} value={tab} onChange={(id) => { setTab(id); setPage(0); }} label="Value status" idPrefix={panelId} />
        <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-tab-${tab}`}>
          <div className="builder__row" style={{ marginBlock: "0.75rem" }}>
            <label className="field">Kind
              <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}>
                <option value="">All kinds</option>
                {VALUE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="field">Search
              <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Mahog" />
            </label>
          </div>

          {isError ? <LoadError what="open values" error={error} onRetry={refetch} /> : (
            <div className="table-shell">
              <table>
                <caption className="sr-only">Dictionary values</caption>
                <thead><tr><th scope="col">Value</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Items</th><th scope="col">Tags</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6}><span className="skeleton" /></td></tr> : rows.length === 0 ? (
                    <tr><td colSpan={6} className="muted">{tab === "pending" ? "Nothing is waiting for review." : "No values match."}</td></tr>
                  ) : rows.map((v) => (
                    <tr key={v.id}>
                      <td><strong><Swatch hex={v.hex} />{v.label}</strong>{v.status === "merged" && <div className="muted">Merged into another value</div>}</td>
                      <td>{kindLabel(v.kind)}</td>
                      <td><span className={`status-pill ${v.status === "approved" ? "status-pill--live" : "status-pill--neutral"}`}>{v.status === "pending" ? "Waiting" : v.status === "approved" ? "Approved" : "Merged"}</span></td>
                      <td>{v.uses}</td>
                      <td>{v.tags.length ? v.tags.join(", ") : <span className="muted">None</span>}</td>
                      <td>
                        {v.status !== "merged" && (
                          <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap" }}>
                            {v.status === "pending" && <Button size="sm" variant="primary" disabled={!canReview || approve.isPending} title={why("values.review")} onClick={() => approve.mutate(v)} aria-label={`Approve ${v.label}`}>Approve</Button>}
                            <Button size="sm" disabled={!canReview} title={why("values.review")} onClick={() => setDialog({ type: "rename", value: v })} aria-label={`Rename ${v.label}`}>Rename</Button>
                            <Button size="sm" disabled={!canReview} title={why("values.review")} onClick={() => setDialog({ type: "merge", value: v })} aria-label={`Merge ${v.label}`}>Merge</Button>
                            <Button size="sm" disabled={!canReview} title={why("values.review")} onClick={() => setDialog({ type: "details", value: v })} aria-label={`Edit tags and shade of ${v.label}`}>Tags</Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </section>
      {dialog?.type === "rename" && <RenameDialog value={dialog.value} onClose={() => setDialog(null)} />}
      {dialog?.type === "merge" && <MergeDialog value={dialog.value} onClose={() => setDialog(null)} />}
      {dialog?.type === "details" && <DetailsDialog value={dialog.value} onClose={() => setDialog(null)} />}
    </div>
  );
}
