// Sizes 1.9: the size chart library and the shoe conversion table. Charts are assigned to product types; buyers see the chart of the item's type.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import Tabs from "../../components/Tabs.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { chartError, itemsUsingText, rowsText, typesText } from "../../lib/sizeCharts.js";
import ChartEditor from "./sizeCharts/ChartEditor.jsx";
import ShoeTab from "./sizeCharts/ShoeTab.jsx";
import * as M from "./sizeCharts/model.js";

const KEY = "admin-size-charts";
const TABS = [{ id: "charts", label: "Charts" }, { id: "shoes", label: "Shoe conversion" }];

function ConfirmDelete({ chart, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const del = useMutation({
    mutationFn: () => api.deleteSizeChart(chart.id),
    onSuccess: () => { toast.push({ message: `Deleted “${chart.name}”.` }); queryClient.invalidateQueries({ queryKey: [KEY] }); onClose(); },
  });
  return (
    <Modal title={`Delete ${chart.name}?`} onClose={del.isPending ? () => {} : onClose}>
      <div className="modal__form">
        <p>This removes the chart for good. A chart that an item or a type still uses cannot be deleted. Switch it off instead if you only want to hide it.</p>
        {del.isError ? <p className="modal__error" role="alert">{chartError(del.error)}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={del.isPending}>Keep it</Button>
          <Button variant="primary" onClick={() => del.mutate()} disabled={del.isPending}>{del.isPending ? "Deleting" : "Delete chart"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function SizeChartsPage() {
  const { can, why } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("charts");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // { chart, original }
  const [removing, setRemoving] = useState(null);
  const canEdit = can("sizecharts.edit");

  useEffect(() => { const t = setTimeout(() => setQuery(typed), 200); return () => clearTimeout(t); }, [typed]);

  const charts = useQuery({ queryKey: [KEY, "charts"], queryFn: () => api.listSizeCharts() });
  const types = useQuery({ queryKey: [KEY, "types"], queryFn: () => api.listProductTypes() });
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.listCategories() });
  const shoe = useQuery({ queryKey: [KEY, "shoe"], queryFn: () => api.getShoeConversion(), enabled: tab === "shoes" });

  const typeName = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t.name])), [types.data]);
  const rows = M.filterCharts(charts.data ?? [], query);

  const save = useMutation({
    mutationFn: (fields) => api.saveSizeChart(editing.chart.id, fields),
    onSuccess: (_id, fields) => {
      toast.push({ message: `Saved “${fields.name}”.` });
      queryClient.invalidateQueries({ queryKey: [KEY] });
      setEditing(null);
    },
  });
  const saveShoe = useMutation({
    mutationFn: (chart) => api.saveShoeConversion(chart),
    onSuccess: (version) => { toast.push({ message: `Shoe table saved (version ${version}).` }); queryClient.invalidateQueries({ queryKey: [KEY, "shoe"] }); },
  });

  const open = (row) => { save.reset(); const c = M.fromRow(row); setEditing({ chart: c, original: c }); };
  const create = () => { save.reset(); setEditing({ chart: M.blankChart(), original: M.blankChart() }); };
  const copy = (row) => { save.reset(); setEditing({ chart: M.duplicateOf(M.fromRow(row)), original: M.blankChart() }); };
  const leave = () => setEditing(null);

  if (editing) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="panel__header"><h2 className="heading-sm">{editing.chart.id ? "Edit size chart" : "New size chart"}</h2></div>
          <ChartEditor
            initial={editing.chart}
            original={editing.original}
            types={types.data ?? []}
            categories={categories.data ?? []}
            canEdit={canEdit}
            saving={save.isPending}
            error={save.isError ? chartError(save.error) : null}
            onSave={(fields) => save.mutate(fields)}
            onCancel={leave}
          />
        </section>
      </div>
    );
  }

  const panelId = "size-charts";
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Size charts</h2>
          {tab === "charts" && <Button variant="primary" onClick={create} disabled={!canEdit} title={why("sizecharts.edit")}>New chart</Button>}
        </div>
        <p className="muted">A size chart is the table buyers open from the &ldquo;Size chart&rdquo; link on an item. Give a chart to the product types it fits. The shoe table converts EU, UK, US and foot length everywhere.</p>
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Size charts sections" idPrefix={panelId} />
        <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-tab-${tab}`}>
          {tab === "charts" ? (
            <>
              <div className="sc-toolbar">
                <label className="field">Search charts
                  <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Dress, shirt, kids" />
                </label>
              </div>
              {charts.isError ? <LoadError what="size charts" error={charts.error} onRetry={charts.refetch} /> : charts.isLoading ? <span className="skeleton" /> : rows.length === 0 ? (
                <div className="sc-note" role="status">{query ? "No chart matches that search." : "No size charts yet. Create the first one and give it to a product type."}</div>
              ) : (
                <ul className="sc-list">
                  {rows.map((c) => (
                    <li key={c.id} className="sc-item">
                      <h3 className="sc-item__name">{c.name}</h3>
                      <div className="sc-item__meta">
                        <span>{c.unit === "none" ? "No unit" : c.unit}</span>
                        <span>{rowsText(c.rows.length)}</span>
                        <span>{c.category ? `Category: ${c.category}` : "Any category"}</span>
                        <span>{itemsUsingText(c.items_using ?? 0)} use it</span>
                      </div>
                      <div>
                        <span className={`status-pill ${c.active ? "status-pill--live" : "status-pill--neutral"}`}>{c.active ? "Shown to buyers" : "Switched off"}</span>
                      </div>
                      <div className="sc-item__meta">
                        {c.product_type_ids.length === 0 ? <span>No product types</span> : <span>{typesText(c.product_type_ids.length)}: {c.product_type_ids.slice(0, 4).map((id) => typeName.get(id) ?? id).join(", ")}{c.product_type_ids.length > 4 ? ` and ${c.product_type_ids.length - 4} more` : ""}</span>}
                      </div>
                      <div className="sc-item__actions">
                        <Button size="sm" variant="primary" onClick={() => open(c)} aria-label={`${canEdit ? "Edit" : "View"} ${c.name}`}>{canEdit ? "Edit" : "View"}</Button>
                        <Button size="sm" disabled={!canEdit} title={why("sizecharts.edit")} onClick={() => copy(c)} aria-label={`Duplicate ${c.name}`}>Duplicate</Button>
                        <Button size="sm" disabled={!canEdit} title={why("sizecharts.edit")} onClick={() => setRemoving(c)} aria-label={`Delete ${c.name}`}>Delete</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : shoe.isError ? <LoadError what="the shoe table" error={shoe.error} onRetry={shoe.refetch} /> : shoe.isLoading ? <span className="skeleton" /> : (
            <ShoeTab stored={shoe.data} canEdit={canEdit} saving={saveShoe.isPending} error={saveShoe.isError ? chartError(saveShoe.error) : null} onSave={(chart) => saveShoe.mutate(chart)} />
          )}
        </div>
      </section>
      {removing && <ConfirmDelete chart={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}
