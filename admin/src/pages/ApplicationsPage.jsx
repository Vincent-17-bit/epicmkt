import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInbox } from "@fortawesome/free-solid-svg-icons";
import Button from "../components/Button.jsx";

export default function ApplicationsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => api.getApplications(),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2>Applications queue</h2>
          <Button>Bulk assign</Button>
        </div>

        <div className="table-shell" role="region" aria-label="Applications queue" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Business</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index}>
                      <td><span className="skeleton" role="status" aria-label="Loading" /></td>
                      <td><span className="skeleton" role="status" aria-label="Loading" /></td>
                      <td><span className="skeleton" role="status" aria-label="Loading" /></td>
                      <td><span className="skeleton" role="status" aria-label="Loading" /></td>
                      <td><span className="skeleton" role="status" aria-label="Loading" /></td>
                    </tr>
                  ))
                : data.map((row) => (
                    <tr key={row.reference || row.businessName}>
                      <td>{row.reference}</td>
                      <td>{row.businessName}</td>
                      <td>{row.ownerName}</td>
                      <td><span className="status-pill status-pill--neutral">{row.status}</span></td>
                      <td>{row.submittedAt}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!isLoading && !data.length ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faInbox} className="empty-state__icon" />
            <p className="empty-state__title">No applications waiting</p>
            <p>New seller applications will show up here.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
