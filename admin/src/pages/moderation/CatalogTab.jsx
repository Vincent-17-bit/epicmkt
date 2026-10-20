import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import Pager from "../../components/Pager.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";

const PAGE_SIZE = 25;
const STATES = [["all", "All items"], ["flagged", "Flagged or reported"], ["hidden", "Hidden by admin"], ["draft", "Drafts"], ["visible", "Visible"]];
const money = (v) => (v == null ? "–" : `KES ${Number(v).toLocaleString("en-KE")}`);

function AskSellerDialog({ item, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [dueDays, setDueDays] = useState(3);
  const ask = useMutation({
    mutationFn: () => api.raiseFlag({ businessId: item.business_id, itemId: item.id, reason, message, dueDays }),
    onSuccess: () => {
      toast.push({ message: "Question sent to the seller." });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation"] });
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-counts"] });
      onClose();
    },
  });
  const ready = reason.trim().length >= 3 && message.trim().length >= 3 && !ask.isPending;
  return (
    <Modal title={`Ask ${item.business_name} about ${item.name}`} onClose={ask.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); if (ready) ask.mutate(); }}>
        <label className="field">What is wrong (for our records)
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="field">Message the seller will see
          <textarea value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="field">Answer within
          <select value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))}>
            {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}
          </select>
        </label>
        {ask.isError ? <p className="modal__error" role="alert">{ask.error.message}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={ask.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>{ask.isPending ? "Sending" : "Send question"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CatalogTab() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState([]);
  const [hideTarget, setHideTarget] = useState(null); // array of ids to hide
  const [askItem, setAskItem] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-moderation", "catalog", state, search, page],
    queryFn: () => api.listCatalog({ state, search, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const done = (message) => {
    toast.push({ message });
    setSelected([]);
    setHideTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-moderation"] });
    queryClient.invalidateQueries({ queryKey: ["admin-moderation-counts"] });
  };
  const hide = useMutation({
    mutationFn: ({ ids, reason }) => api.bulkSetItemsHidden({ ids, hidden: true, reason }),
    onSuccess: (n) => done(`${n} ${n === 1 ? "item" : "items"} hidden. Sellers are notified.`),
  });
  const show = useMutation({
    mutationFn: (ids) => api.bulkSetItemsHidden({ ids, hidden: false }),
    onSuccess: (n) => done(`${n} ${n === 1 ? "item" : "items"} shown again.`),
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
  });

  const rows = data?.rows ?? [];
  const canHide = can("moderation.resolve");
  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <div>
      <div className="toolbar">
        <label className="field">Show
          <select value={state} onChange={(e) => { setState(e.target.value); setPage(0); setSelected([]); }}>
            {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">Search
          <input type="search" value={search} placeholder="Item or business" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </label>
        {selected.length > 0 && (
          <div className="toolbar__bulk" role="group" aria-label="Selected items">
            <span>{selected.length} selected</span>
            <Button size="sm" disabled={!canHide} title={why("moderation.resolve")} onClick={() => setHideTarget(selected)}>Hide</Button>
            <Button size="sm" disabled={!canHide || show.isPending} title={why("moderation.resolve")} onClick={() => show.mutate(selected)}>Show again</Button>
          </div>
        )}
      </div>

      {isError ? <LoadError what="the catalogue" error={error} onRetry={refetch} /> : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all items on this page" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} /></th>
                <th>Item</th><th>Business</th><th>Price</th><th>State</th><th>Flags</th><th />
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                : rows.length === 0 ? <tr><td colSpan={7}>No items match.</td></tr>
                : rows.map((row) => (
                  <tr key={row.id}>
                    <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td>
                    <td><strong>{row.name}</strong>{row.section ? <div className="muted">{row.section}</div> : null}</td>
                    <td><Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link></td>
                    <td>{money(row.sale_price ?? row.price)}</td>
                    <td>
                      {row.hidden_by_admin ? <span className="status-pill status-pill--down">Hidden</span>
                        : row.draft ? <span className="status-pill status-pill--neutral">Draft</span>
                        : row.visible ? <span className="status-pill status-pill--live">Visible</span>
                        : <span className="status-pill status-pill--neutral">Off</span>}
                      {row.hidden_by_admin && row.admin_hide_reason ? <div className="muted">{row.admin_hide_reason}</div> : null}
                    </td>
                    <td>{row.open_flags + row.open_reports > 0 ? `${row.open_flags} flag${row.open_flags === 1 ? "" : "s"}, ${row.open_reports} report${row.open_reports === 1 ? "" : "s"}` : "–"}</td>
                    <td className="row-actions">
                      <Button size="sm" disabled={!can("moderation.resolve")} title={why("moderation.resolve")} onClick={() => setAskItem(row)} aria-label={`Ask seller about ${row.name}`}>Ask seller</Button>
                      {row.hidden_by_admin
                        ? <Button size="sm" disabled={!canHide || show.isPending} title={why("moderation.resolve")} onClick={() => show.mutate([row.id])} aria-label={`Show ${row.name}`}>Show</Button>
                        : <Button size="sm" disabled={!canHide} title={why("moderation.resolve")} onClick={() => setHideTarget([row.id])} aria-label={`Hide ${row.name}`}>Hide</Button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />

      {hideTarget && (
        <ConfirmDialog
          title="Hide from customers"
          summary={`${hideTarget.length} ${hideTarget.length === 1 ? "item" : "items"} will disappear from the customer site and the seller is told why.`}
          confirmLabel="Hide"
          danger
          busy={hide.isPending}
          error={hide.isError ? hide.error.message : ""}
          onConfirm={(reason) => hide.mutate({ ids: hideTarget, reason })}
          onCancel={() => { hide.reset(); setHideTarget(null); }}
        />
      )}
      {askItem && <AskSellerDialog item={askItem} onClose={() => setAskItem(null)} />}
    </div>
  );
}
