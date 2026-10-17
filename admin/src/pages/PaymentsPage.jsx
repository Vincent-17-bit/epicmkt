import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCreditCard } from "@fortawesome/free-solid-svg-icons";
import Button from "../components/Button.jsx";

export default function PaymentsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => api.getPayments(),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2>Payments and subscriptions</h2>
          <Button>Record manual payment</Button>
        </div>

        <div className="table-shell" role="region" aria-label="Payments and subscriptions" tabIndex={0}>
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
                    <tr key={index}><td><span className="skeleton" role="status" aria-label="Loading" /></td><td><span className="skeleton" role="status" aria-label="Loading" /></td><td><span className="skeleton" role="status" aria-label="Loading" /></td><td><span className="skeleton" role="status" aria-label="Loading" /></td><td><span className="skeleton" role="status" aria-label="Loading" /></td></tr>
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
        {!isLoading && !data.length ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faCreditCard} className="empty-state__icon" />
            <p className="empty-state__title">No payments yet</p>
            <p>Confirmed and pending payments will show up here.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
