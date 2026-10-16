import { useState } from "react";
import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";
import ReviewFocus from "../components/ReviewFocus.jsx";
import { isReviewable } from "../lib/decisions.js";

const STATUS_LABEL = {
  submitted: "Submitted",
  under_review: "Under review",
  changes_requested: "Needs changes",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ApplicationsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => api.getApplications(),
  });
  const [focus, setFocus] = useState(null); // { startId } while focus mode is open

  const waiting = data.filter(isReviewable);

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Applications queue</h3>
          <div className="panel__actions">
            <button
              type="button"
              className="primary-button"
              disabled={isLoading || waiting.length === 0}
              onClick={() => setFocus({ startId: waiting[0]?.id })}
            >
              {waiting.length ? `Start review (${waiting.length})` : "Inbox zero"}
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Business</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Submitted</th>
                <th><span className="sr-only">Review</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <td key={cell}><span className="skeleton" /></td>
                      ))}
                    </tr>
                  ))
                : data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.reference}</td>
                      <td>{row.businessName}</td>
                      <td>{row.ownerName}</td>
                      <td><span className="status-pill status-pill--neutral">{STATUS_LABEL[row.status] ?? row.status}</span></td>
                      <td>{row.submittedAt}</td>
                      <td>
                        {isReviewable(row) ? (
                          <button type="button" className="link-button" onClick={() => setFocus({ startId: row.id })}>Review</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      {focus ? <ReviewFocus applications={data} startId={focus.startId} onExit={() => setFocus(null)} /> : null}
    </div>
  );
}
