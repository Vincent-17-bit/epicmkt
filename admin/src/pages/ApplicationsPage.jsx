import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "../components/Button.jsx";
import Tabs from "../components/Tabs.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorCard from "../components/ErrorCard.jsx";
import { faFileSignature } from "@fortawesome/free-solid-svg-icons";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import {
  APPLICATION_TABS, DEFAULT_TAB, PAGE_SIZE, canReview, formatKes, isOverdue, tabById, tabCounts,
} from "../lib/applications.js";
import { formatDateTime, timeAgo } from "../lib/time.js";
import ApplicationStatus from "./applications/ApplicationStatus.jsx";
import "./applications/applications.css";

const ID_PREFIX = "applications";
const COLUMNS = 7;

export default function ApplicationsPage() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  const allowed = canReview(admin?.role);

  const [tab, setTab] = useState(DEFAULT_TAB);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Wait for a pause in typing before asking the server, and start from page one for every new search or tab.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  useEffect(() => setPage(0), [tab, search]);

  const counts = useAdminCounts();

  const list = useQuery({
    queryKey: ["admin-applications", tab, search, page],
    queryFn: () => api.listApplications({ tab, search, page, pageSize: PAGE_SIZE }),
    enabled: allowed,
    placeholderData: (previous) => previous,
  });

  if (!allowed) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="panel__header"><h3>Applications</h3></div>
          <p className="muted">
            Applications hold ID numbers and documents, so only owners and reviewers can open them. Your role is {admin?.role ?? "unknown"}.
          </p>
        </section>
      </div>
    );
  }

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const showSkeleton = list.isPending;
  const emptyTitle = search ? "No applications match your search" : `No applications in “${tabById(tab).label}”`;

  return (
    <div className="page-shell">
      <Tabs tabs={APPLICATION_TABS} value={tab} onChange={setTab} counts={tabCounts(counts.data)} label="Application status" idPrefix={ID_PREFIX} />

      <section className="panel" id={`${ID_PREFIX}-panel`} role="tabpanel" aria-labelledby={`${ID_PREFIX}-tab-${tab}`}>
        <div className="panel__header applications__toolbar">
          <h3>{tabById(tab).label}</h3>
          <label className="applications__search">
            <span className="sr-only">Search applications</span>
            <input
              type="search"
              value={searchText}
              placeholder="Search by reference, business, owner or phone"
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
        </div>

        {list.isError ? <ErrorCard what="applications" error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} /> : null}

        <div className="table-shell">
          <table className="applications__table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Business</th>
                <th>Owner</th>
                <th>Town</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody aria-busy={list.isFetching}>
              {showSkeleton
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: COLUMNS }).map((__, cell) => <td key={cell}><Skeleton /></td>)}
                    </tr>
                  ))
                : rows.map((row) => {
                    const overdue = isOverdue(row);
                    return (
                      <tr key={row.id} className="applications__row" onClick={() => navigate(`/admin/applications/${row.id}`)}>
                        <td>
                          <Link to={`/admin/applications/${row.id}`} onClick={(event) => event.stopPropagation()}>{row.reference}</Link>
                        </td>
                        <td>{row.businessName}</td>
                        <td>{row.ownerName}</td>
                        <td>{row.town}</td>
                        <td>{row.plan === "premium" ? "Premium" : "Standard"} <span className="muted">{formatKes(row.price)}</span></td>
                        <td><ApplicationStatus status={row.status} /></td>
                        <td title={formatDateTime(row.submittedAt)}>
                          {timeAgo(row.submittedAt)}
                          {overdue ? <span className="chip chip--danger applications__overdue">Over 24h</span> : null}
                        </td>
                      </tr>
                    );
                  })}
              {!showSkeleton && rows.length === 0 && !list.isError ? (
                <tr>
                  <td colSpan={COLUMNS} className="applications__empty">
                    <EmptyState
                      icon={faFileSignature}
                      title={emptyTitle}
                      action={search ? { label: "Clear search", onClick: () => setSearchText("") } : tab !== DEFAULT_TAB ? { label: `Show ${tabById(DEFAULT_TAB).label.toLowerCase()}`, onClick: () => setTab(DEFAULT_TAB) } : undefined}
                    >
                      {search ? "Try a reference, a business name, an owner or a phone number." : "New applications show up here as sellers submit them."}
                    </EmptyState>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="applications__pager">
          <span className="muted" aria-live="polite">{total === 0 ? "" : `${first} to ${last} of ${total}`}</span>
          <div className="applications__pager-buttons">
            <Button size="sm" disabled={page === 0 || list.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <Button size="sm" disabled={!hasNext || list.isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
