import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { assignApplications, exportApplications, startReview, subscribeApplications } from "../api/index.js";
import { Button, DataTable, Tabs } from "../components/index.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useApplicationList, useApplicationTabCounts, useQueueCategories, useReviewers } from "../hooks/useApplications.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { QUEUE_TABS, fromParams, hasFilters, normalizeQuery, toParams, viewState } from "../lib/queueQuery.js";
import { SLA_MS, SLA_WARN_MS } from "../lib/sla.js";
import { playChime } from "../lib/sound.js";
import { useLiveStore } from "../state/liveStore.js";
import BulkAssignDialog from "./applications/BulkAssignDialog.jsx";
import Filters from "./applications/Filters.jsx";
import { buildColumns } from "./applications/columns.jsx";
import s from "./applications/applications.module.css";

const FRESH_MS = 5 * 60_000; // an application submitted in the last five minutes counts as "new"
const SEARCH_DELAY = 300;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Re-renders every `ms`, so "5 h 20 min left" and the SLA tone keep moving without a reload. */
function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/**
 * The applications queue. The address bar holds the query (tab, filters, sort, page), so a link or a refresh lands on
 * the same list and the browser's Back button steps through what you looked at. Data comes from the server a page at a
 * time; Realtime only tells this page that something moved, and the list is re-read.
 */
export default function ApplicationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { admin } = useAuth();
  const { can, role } = usePermissions();
  const me = admin?.userId ?? null;
  const isOwner = role === "owner";
  const now = useNow(30_000);

  // ---- the query lives in the URL -------------------------------------------------------------------------------
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => fromParams(params), [params]);
  const apply = useCallback((next, { push = false } = {}) => setParams(toParams(next), { replace: !push }), [setParams]);
  /** A change to the tab, a filter or the sort goes back to page 1. Paging alone keeps the filters. */
  const change = useCallback((patch, options) => apply(normalizeQuery({ ...query, page: 1, ...patch }), options), [apply, query]);

  // ---- search, typed locally and sent after a short pause ----------------------------------------------------------
  const [text, setText] = useState(query.q);
  const sentText = useRef(query.q);
  useEffect(() => { if (query.q !== sentText.current) { sentText.current = query.q; setText(query.q); } }, [query.q]);
  useEffect(() => {
    if (text.trim() === sentText.current) return undefined;
    const id = setTimeout(() => { sentText.current = text.trim(); change({ q: text }); }, SEARCH_DELAY);
    return () => clearTimeout(id);
  }, [text, change]);

  // ---- data -------------------------------------------------------------------------------------------------------
  const list = useApplicationList(query, me);
  const tabCounts = useApplicationTabCounts(query, me);
  const reviewerList = useReviewers();
  const categories = useQueueCategories();
  const reviewers = reviewerList.data ?? [];
  const reviewerById = useMemo(() => new Map(reviewers.map((r) => [r.id, r])), [reviewers]);
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtersActive = hasFilters(query);

  // ---- selection survives paging, and resets when the list itself changes -----------------------------------------
  const [selected, setSelected] = useState(() => new Set());
  const listKey = JSON.stringify([query.status, query.q, query.category, query.plan, query.assignee, query.sla]);
  useEffect(() => { setSelected(new Set()); }, [listKey]);

  // ---- start a review from a row ----------------------------------------------------------------------------------
  const [starting, setStarting] = useState(null);
  const start = useMutation({
    mutationFn: (row) => startReview(row.id),
    onMutate: (row) => setStarting(row.id),
    onSuccess: (_s, row) => { toast.success(`You started the review of ${row.business_name}.`); queryClient.invalidateQueries({ queryKey: ["applications"] }); queryClient.invalidateQueries({ queryKey: ["admin-counts"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (error) => toast.error(error.message),
    onSettled: () => setStarting(null),
  });

  // ---- assign ------------------------------------------------------------------------------------------------------
  const [assignOpen, setAssignOpen] = useState(false);
  const assign = useMutation({
    mutationFn: ({ ids, reviewerId }) => assignApplications(ids, reviewerId, { userId: me, role }),
    onSuccess: ({ updated, skipped }, { reviewerId, name }) => {
      const who = reviewerId == null ? null : reviewerId === me ? "you" : name ?? "them";
      const done = updated === 0 ? "Nothing changed." : who ? `Assigned ${plural(updated, "application", "applications")} to ${who}.` : `Cleared the assignee on ${plural(updated, "application", "applications")}.`;
      const why = skipped > 0 ? ` ${plural(skipped, "was", "were")} skipped: finished, already set that way, or with a colleague.` : "";
      (updated === 0 ? toast.warning : toast.success)(done + why);
      setSelected(new Set());
      setAssignOpen(false);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const bulk = (reviewerId, name) => assign.mutate({ ids: [...selected], reviewerId, name });

  // ---- Realtime: a new application gets a toast; any change re-reads the list ---------------------------------------
  const [fresh, setFresh] = useState(() => new Set());
  const knownIds = useRef(new Set());
  knownIds.current = new Set(rows.map((r) => r.id));
  const announced = useRef(new Set());
  const latest = useRef({});
  latest.current = { change, toast };
  useEffect(() => {
    const unhush = useLiveStore.getState().hush("application_submitted"); // this page shows its own toast
    let timer = 0;
    const reread = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { queryClient.invalidateQueries({ queryKey: ["applications"] }); queryClient.invalidateQueries({ queryKey: ["admin-counts"] }); }, 500);
    };
    const stop = subscribeApplications({
      onRow: (row) => {
        reread();
        if (!row || row.status !== "submitted" || announced.current.has(row.id) || knownIds.current.has(row.id)) return;
        const age = Date.now() - Date.parse(row.submitted_at ?? "");
        if (!(age >= 0 && age <= FRESH_MS)) return; // a reopened or reassigned older application is not "new"
        announced.current.add(row.id);
        setFresh((prev) => new Set(prev).add(row.id));
        setTimeout(() => setFresh((prev) => { const next = new Set(prev); next.delete(row.id); return next; }), 8000);
        latest.current.toast.info([row.business_name, row.reference_no].filter(Boolean).join(" · ") || "A seller submitted an application", {
          title: "New application", duration: 8000,
          action: { label: "Show", onAction: () => latest.current.change({ status: "submitted", q: "", category: "", plan: "", assignee: "any", sla: "", sort: "submitted_at", dir: "desc" }, { push: true }) },
        });
        if (useLiveStore.getState().soundOn) playChime();
      },
    });
    return () => { clearTimeout(timer); stop(); unhush(); };
  }, [queryClient]);

  // ---- table pieces ----------------------------------------------------------------------------------------------
  const startReviewOf = start.mutate; // stable between renders, unlike the mutation object
  const columns = useMemo(
    () => buildColumns({ now, me, reviewers: reviewerById, can, onStartReview: startReviewOf, starting }),
    [now, me, reviewerById, can, startReviewOf, starting],
  );
  const getRowId = useCallback((row) => row.id, []);
  const getRowLabel = useCallback((row) => `${row.business_name}, ${row.reference_no}`, []);
  const rowTone = useCallback((row) => {
    if (row.status !== "submitted" || !row.submitted_at) return undefined;
    const waited = now.getTime() - Date.parse(row.submitted_at);
    return waited >= SLA_MS ? "danger" : waited >= SLA_WARN_MS ? "warning" : undefined;
  }, [now]);
  const sort = { key: query.sort, dir: query.dir };

  const table = (
    <DataTable
      id="applications" label="Applications" noun={{ singular: "application", plural: "applications" }}
      columns={columns} rows={rows} total={total} getRowId={getRowId} getRowLabel={getRowLabel}
      loading={list.isPending} fetching={list.isFetching} error={list.isError ? list.error : null} onRetry={() => list.refetch()}
      page={query.page} pageSize={query.size} onPageChange={(page) => apply({ ...query, page })} onPageSizeChange={(size) => change({ size })}
      sort={sort} onSortChange={({ key, dir }) => change({ sort: key, dir })}
      search={{ value: text, onChange: setText, placeholder: "Search business, reference, owner, phone or email", label: "Search applications" }}
      filters={<Filters query={query} onChange={change} categories={categories.data ?? []} reviewers={reviewers} me={me} filtersActive={filtersActive} onClear={() => change({ q: "", category: "", plan: "", assignee: "any", sla: "" })} />}
      selection={can("applications.assign") ? { ids: selected, onChange: setSelected } : undefined}
      bulkActions={({ ids }) => (
        <>
          <Button size="sm" variant="primary" loading={assign.isPending && assign.variables?.reviewerId === me} disabled={!me} onClick={() => bulk(me, "you")}>Assign to me</Button>
          {isOwner ? <Button size="sm" onClick={() => setAssignOpen(true)}>Assign to…</Button> : null}
          <Button size="sm" variant="ghost" loading={assign.isPending && assign.variables?.reviewerId == null} onClick={() => bulk(null, null)}>Unassign {ids.length === 1 ? "it" : "them"}</Button>
        </>
      )}
      rowTone={rowTone} highlightIds={fresh}
      onExportAll={() => exportApplications(query, { me })}
      views={{ state: viewState(query), onApply: (state) => change({ ...state }), pristine: params.toString() === "", scope: me ?? "" }}
      filtered={filtersActive} filtersCount={[query.category, query.plan, query.assignee !== "any", query.sla, query.sort !== "submitted_at" || query.dir !== "asc"].filter(Boolean).length}
      empty={{ illustration: "inbox", title: query.status === "submitted" ? "The queue is clear" : "Nothing here yet", description: query.status === "submitted" ? "New applications appear here the moment a seller submits them." : "Applications in this stage will show up here." }}
    />
  );

  return (
    <div className={`page-shell ${s.shell}`}>
      <div className={s.page}>
        <Tabs
          className={s.tabs} label="Application stages" value={query.status} onChange={(id) => change({ status: id, sort: undefined, dir: undefined, sla: "" }, { push: true })}
          items={QUEUE_TABS.map((tab) => ({ id: tab.id, label: tab.label, count: tabCounts.data?.[tab.id], content: table }))}
        />
      </div>
      <BulkAssignDialog
        open={assignOpen} count={selected.size} reviewers={reviewers} me={me} busy={assign.isPending}
        onClose={() => setAssignOpen(false)} onConfirm={(reviewerId, name) => bulk(reviewerId, name)}
      />
    </div>
  );
}
