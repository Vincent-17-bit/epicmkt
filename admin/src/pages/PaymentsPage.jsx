import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";

export default function PaymentsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api.getPayments(),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Payments and subscriptions</h3>
          <button type="button" className="secondary-button">Record manual payment</button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Business</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Code</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index}><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td><td><span className="skeleton" /></td></tr>
                  ))
                : data.map((row) => (
                    <tr key={row.receipt || row.mpesaCode}>
                      <td>{row.receipt}</td>
                      <td>{row.businessName}</td>
                      <td>KES {row.amount}</td>
                      <td><span className="status-pill status-pill--neutral">{row.status}</span></td>
                      <td>{row.mpesaCode}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
