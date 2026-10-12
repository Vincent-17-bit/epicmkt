import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";

export default function BusinessesPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: () => api.getBusinesses(),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Businesses</h3>
          <button type="button" className="secondary-button">Export CSV</button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Town</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Paid until</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index}><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td></tr>
                  ))
                : data.map((row) => (
                    <tr key={row.slug || row.name}>
                      <td>{row.name}</td>
                      <td>{row.town}</td>
                      <td>{row.plan}</td>
                      <td><span className="status-pill status-pill--live">{row.status}</span></td>
                      <td>{row.paidUntil}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
