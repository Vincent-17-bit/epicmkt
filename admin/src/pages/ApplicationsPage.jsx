import { Link } from "react-router-dom";
import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";

export default function ApplicationsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => api.getApplications(),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Applications queue</h3>
          <button type="button" className="secondary-button">Bulk assign</button>
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
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index}>
                      <td><span className="skeleton" /></td>
                      <td><span className="skeleton" /></td>
                      <td><span className="skeleton" /></td>
                      <td><span className="skeleton" /></td>
                      <td><span className="skeleton" /></td>
                    </tr>
                  ))
                : data.map((row) => (
                    <tr key={row.reference || row.businessName}>
                      <td><Link className="inline-link" to={`/admin/applications/${row.id}`}>{row.reference}</Link></td>
                      <td>{row.businessName}</td>
                      <td>{row.ownerName}</td>
                      <td><span className="status-pill status-pill--neutral">{row.status}</span></td>
                      <td>{row.submittedAt}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
