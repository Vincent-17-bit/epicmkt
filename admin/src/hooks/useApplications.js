import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getApplicationTabCounts, getQueueCategories, getReviewers, listApplications } from "../api/index.js";
import { filterOps, normalizeQuery } from "../lib/queueQuery.js";

// Every key starts with "applications" so one invalidateQueries({ queryKey: ["applications"] }) refreshes the lot.

/** One page of the queue. The previous page stays on screen while the next one loads, so the table never flashes empty. */
export function useApplicationList(query, me) {
  const q = normalizeQuery(query);
  return useQuery({ queryKey: ["applications", "list", q, me], queryFn: () => listApplications(q, { me }), placeholderData: keepPreviousData });
}

/** Tab counts follow the search and filters, but not the tab or the SLA filter. Reading everything but those is the cache key. */
export function useApplicationTabCounts(query, me) {
  const q = normalizeQuery(query);
  const key = JSON.stringify(filterOps({ ...q, status: "all" }, { me, skip: ["status", "sla"] }));
  return useQuery({ queryKey: ["applications", "tabs", key], queryFn: () => getApplicationTabCounts(q, { me }), placeholderData: keepPreviousData });
}

export const useReviewers = () => useQuery({ queryKey: ["applications", "reviewers"], queryFn: getReviewers, staleTime: 5 * 60_000 });
export const useQueueCategories = () => useQuery({ queryKey: ["applications", "categories"], queryFn: getQueueCategories, staleTime: 30 * 60_000 });
