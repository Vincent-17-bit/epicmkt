import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";

const KEY = "admin-trending";
const KINDS = { store: "Store", flash: "Flash sale", category: "Category", product: "Product" };

// One action on the page: run it, say it worked (or why not), and reload the lists.
function useAction(fn, done) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.push({ message: done });
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (e) => toast.push({ message: e?.message || "That did not work. Try again.", tone: "error" })
  });
}

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "never");

/**
 * What shoppers search for, every kind ranked in one list: popular this week and rising now. Rebuilt every hour. An admin can pin a
 * word to the top for a few days (it still needs something live to show), hide a word at once, and say which words mean the same thing.
 */
export default function TrendingPage() {
  const uid = useId();
  const { can, why } = usePermissions();
  const manage = can("trending.manage");
  const [synonym, setSynonym] = useState({ variant: "", canonical: "" });
  const [pinDays, setPinDays] = useState(7);

  const q = useQuery({ queryKey: [KEY], queryFn: () => api.getTrendingOverview(), refetchInterval: 5 * 60_000 });
  const data = q.data;

  const pin = useAction(({ term }) => api.pinTrending(term, pinDays, null), "Pinned to the top");
  const unpin = useAction((term) => api.unpinTrending(term), "Unpinned");
  const hide = useAction((term) => api.hideTrending(term), "Hidden. It is out of the lists now");
  const unhide = useAction((term) => api.unhideTrending(term), "Shown again from the next rebuild");
  const addSynonym = useAction(({ variant, canonical }) => api.setSynonym(variant, canonical), "Saved. It counts from the next rebuild");
  const dropSynonym = useAction((variant) => api.removeSynonym(variant), "Removed");

  const status = data?.status;
  const pinned = new Set((data?.pins ?? []).map((p) => p.term));

  const table = (rows, { rising = false } = {}) => (
    <div className="table-shell">
      <table>
        <caption className="sr-only">{rising ? "Rising now" : "Popular this week"}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Word</th>
            <th scope="col">What it is</th>
            <th scope="col">{rising ? "Jump" : "People"}</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term}>
              <td>{r.rank}</td>
              <td>
                {r.term}
                {r.pinned || pinned.has(r.term) ? <> <span className="muted">(pinned)</span></> : null}
                {!rising && r.hot ? <> <span className="muted">(rising)</span></> : null}
              </td>
              <td>{KINDS[r.kind] ?? r.kind}{r.name && r.name.toLowerCase() !== r.term ? <span className="muted"> · {r.name}</span> : null}</td>
              <td>{rising ? `${Number(r.ratio).toFixed(1)}×, ${r.people} people` : r.people}</td>
              <td>
                {!rising && !(r.pinned || pinned.has(r.term)) ? (
                  <Button size="sm" disabled={!manage} title={why("trending.manage")} onClick={() => pin.mutate({ term: r.term })} aria-label={`Pin ${r.term} to the top`}>Pin</Button>
                ) : null}{" "}
                <Button size="sm" disabled={!manage} title={why("trending.manage")} onClick={() => hide.mutate(r.term)} aria-label={`Hide ${r.term}`}>Hide</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h1 className="heading-sm" id={`${uid}-t`}>Trending</h1></div>
      <p className="muted">
        What shoppers search for, whatever it is: a store, a product, a flash sale or a category, ranked together. Counted as different people.
        Rebuilt every hour. Only words a shopper can actually reach right now are shown.
      </p>

      {q.isError ? <LoadError onRetry={() => q.refetch()} /> : null}
      {q.isPending ? <p className="muted" role="status">Loading…</p> : null}

      {status && !status.ok ? (
        <div className="notice notice--warning" role="alert">
          <strong>The trending lists are out of date.</strong>{" "}
          {status.computedAt ? `They were last rebuilt ${when(status.computedAt)} (${Math.round((status.ageMinutes ?? 0) / 60)} hours ago).` : "They have never been built."}{" "}
          Shoppers are seeing the live count of the last 24 hours instead. Check that the <code>trending</code> job is running
          (<code>docs/cron-runbook.md</code>).
        </div>
      ) : null}
      {status?.ok ? <p className="muted">Last rebuilt {when(status.computedAt)}. A word needs at least {status.minPeople} different people, more when the site is busy.</p> : null}

      {data ? (
        <>
          <h2 className="heading-sm heading-flow">Popular this week</h2>
          {data.popular.length === 0 ? <p className="muted">Nothing has been searched enough yet. Shoppers see the busiest categories instead.</p> : table(data.popular)}

          <h2 className="heading-sm heading-flow">Rising now</h2>
          {data.rising.length === 0 ? <p className="muted">Nothing is rising against its own average right now.</p> : table(data.rising, { rising: true })}

          <p className="muted">
            {data.counties.length > 0
              ? `Counties with their own list: ${data.counties.join(", ")}. Other counties see the national list.`
              : "No county has enough searches of its own yet, so everyone sees the national list."}
          </p>

          <h2 className="heading-sm heading-flow">Pinned</h2>
          <div className="kit-row">
            <label className="field">Pin for
              <select value={pinDays} onChange={(e) => setPinDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}
              </select>
            </label>
          </div>
          {data.pins.length === 0 ? <p className="muted">Nothing is pinned. Use Pin on a word above. At most 3 at a time.</p> : (
            <ul>
              {data.pins.map((p) => (
                <li key={p.term}>
                  {p.term} <span className="muted">until {when(p.expiresAt)}</span>{" "}
                  <Button size="sm" disabled={!manage} title={why("trending.manage")} onClick={() => unpin.mutate(p.term)} aria-label={`Unpin ${p.term}`}>Unpin</Button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="heading-sm heading-flow">Hidden words</h2>
          <p className="muted">A word containing one of these is never shown, in any list.</p>
          {data.hidden.length === 0 ? <p className="muted">Nothing is hidden.</p> : (
            <ul>
              {data.hidden.map((h) => (
                <li key={h}>
                  {h}{" "}
                  <Button size="sm" disabled={!manage} title={why("trending.manage")} onClick={() => unhide.mutate(h)} aria-label={`Show ${h} again`}>Show again</Button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="heading-sm heading-flow">Words that mean the same</h2>
          <p className="muted">Plural endings are already merged ("gas cylinder" and "gas cylinders"). Add other spellings or Swahili and Sheng words here so their counts join.</p>
          <form
            className="kit-row"
            onSubmit={(e) => {
              e.preventDefault();
              addSynonym.mutate(synonym, { onSuccess: () => setSynonym({ variant: "", canonical: "" }) });
            }}
          >
            <label className="field">People type
              <input value={synonym.variant} onChange={(e) => setSynonym({ ...synonym, variant: e.target.value })} maxLength={60} placeholder="gesi" />
            </label>
            <label className="field">Count it as
              <input value={synonym.canonical} onChange={(e) => setSynonym({ ...synonym, canonical: e.target.value })} maxLength={60} placeholder="gas" />
            </label>
            <Button type="submit" variant="primary" disabled={!manage || !synonym.variant.trim() || !synonym.canonical.trim()} title={why("trending.manage")}>Save</Button>
          </form>
          {data.synonyms.length > 0 ? (
            <ul>
              {data.synonyms.map((s) => (
                <li key={s.variant}>
                  {s.variant} → {s.canonical}{" "}
                  <Button size="sm" disabled={!manage} title={why("trending.manage")} onClick={() => dropSynonym.mutate(s.variant)} aria-label={`Remove ${s.variant}`}>Remove</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
