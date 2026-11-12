// Items on one size chart, and a way to put one single item on it (or take it off). Sellers choose a chart on their own items;
// this is for fixing a wrong chart without waiting for the seller. Owner only to change; everyone who can see charts can look.
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/index.js";
import Button from "../../../components/Button.jsx";
import { useToast } from "../../../components/Toast.jsx";
import { chartError } from "../../../lib/sizeCharts.js";

const KEY = "admin-size-chart-items";

export default function ChartItems({ chart, canEdit }) {
  const uid = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");

  const onChart = useQuery({ queryKey: [KEY, "on", chart.id], queryFn: () => api.listItemsForSizeChart(chart.id, "", 50) });
  const found = useQuery({ queryKey: [KEY, "find", query], queryFn: () => api.listItemsForSizeChart(null, query, 20), enabled: query.length >= 2 });

  const assign = useMutation({
    mutationFn: ({ item, chartId }) => api.setItemSizeChart(item.id, chartId),
    onSuccess: (_r, { item, chartId }) => {
      setError("");
      const text = chartId ? `${item.name} now uses this chart.` : `${item.name} no longer uses this chart.`;
      setAnnounce(text);
      toast.push({ message: text });
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ["admin-size-charts"] });
    },
    onError: (e) => setError(chartError(e)),
  });

  const search = (e) => { e.preventDefault(); setQuery(typed.trim()); };
  const busy = assign.isPending;
  const here = onChart.data ?? [];
  const results = (found.data ?? []).filter((i) => i.size_chart_id !== chart.id);

  return (
    <section className="sc-card" aria-labelledby={`${uid}-t`} data-testid="chart-items">
      <h3 id={`${uid}-t`} className="heading-sm">Items on this chart</h3>
      <p className="muted">Buyers see this chart for these items whatever their product type says. To change one item, search for it below.</p>

      {onChart.isLoading ? <p className="muted">Loading</p> : here.length === 0 ? <p className="muted">No item uses this chart on its own.</p> : (
        <ul className="sc-items">
          {here.map((i) => (
            <li key={i.id} className="sc-items__row">
              <span><strong>{i.name}</strong> <span className="muted">· {i.business_name}</span></span>
              {canEdit && <Button type="button" disabled={busy} aria-label={`Take ${i.name} off this chart`} onClick={() => assign.mutate({ item: i, chartId: null })}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="sc-items__find" role="search" aria-label="Find an item">
          <label className="field" htmlFor={`${uid}-q`}>Find an item by name</label>
          <div className="sc-items__search">
            <input id={`${uid}-q`} type="search" value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(e); }} placeholder="Linen sundress" autoComplete="off" />
            <Button type="button" disabled={typed.trim().length < 2} onClick={search}>Search</Button>
          </div>
          {query.length >= 2 && (found.isLoading ? <p className="muted">Searching</p> : results.length === 0 ? <p className="muted">No other item matches “{query}”.</p> : (
            <ul className="sc-items" aria-label="Search results">
              {results.map((i) => (
                <li key={i.id} className="sc-items__row">
                  <span><strong>{i.name}</strong> <span className="muted">· {i.business_name}{i.size_chart_name ? ` · now uses ${i.size_chart_name}` : " · no chart of its own"}</span></span>
                  <Button type="button" disabled={busy || !chart.active} aria-label={`Use this chart for ${i.name}`} onClick={() => assign.mutate({ item: i, chartId: chart.id })}>Use this chart</Button>
                </li>
              ))}
            </ul>
          ))}
          {!chart.active && <p className="sc-note">This chart is switched off, so it cannot be given to more items.</p>}
        </div>
      )}
      {!canEdit && <p className="muted">Only the Owner can change the chart of an item.</p>}
      {error ? <p className="modal__error" role="alert">{error}</p> : null}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </section>
  );
}
