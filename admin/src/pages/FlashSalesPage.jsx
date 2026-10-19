import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { describeError } from "../lib/systemStatus.js";

const STATUSES = [["", "All"], ["live", "Live"], ["scheduled", "Scheduled"], ["ended", "Ended"]];
const REASONS = { time: "Ended on time", seller: "Ended by seller", admin: "Stopped by admin", item_removed: "Item removed", subscription: "Listing not active" };
const stamp = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

export default function FlashSalesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");

  const { data = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ["admin-flash-sales", status],
    queryFn: () => api.listFlashSales({ status }),
    refetchInterval: 30_000,
  });

  const end = useMutation({
    mutationFn: ({ id, reason }) => api.endFlashSale({ id, reason }),
    onSuccess: () => {
      setTarget(null);
      setError("");
      toast.push({ message: "Flash sale ended. The seller has been notified." });
      queryClient.invalidateQueries({ queryKey: ["admin-flash-sales"] });
    },
    onError: (failure) => setError(failure.message),
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Flash sales</h3>
          <label className="field">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {isError ? (
          <div role="alert">
            <p>We could not load flash sales. <Button onClick={() => refetch()}>Try again</Button></p>
            <p><strong>{describeError(loadError).title}.</strong> {describeError(loadError).cause}</p>
          </div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Item</th>
                  <th>Discount</th>
                  <th>Ends</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index}>{Array.from({ length: 6 }).map((__, cell) => <td key={cell}><span className="skeleton" /></td>)}</tr>
                  ))
                ) : data.length === 0 ? (
                  <tr><td colSpan={6}>No flash sales.</td></tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.businessName}</td>
                      <td>{row.itemName}</td>
                      <td>{row.discount}</td>
                      <td>{stamp(row.endsAt)}</td>
                      <td>
                        <span className={`status-pill ${row.status === "live" ? "status-pill--live" : "status-pill--neutral"}`}>{row.status}</span>
                        {row.endedReason ? ` ${REASONS[row.endedReason] ?? ""}` : ""}
                      </td>
                      <td>
                        {["live", "scheduled"].includes(row.status) && (
                          <Button size="sm" onClick={() => { setError(""); setTarget(row); }} aria-label={`End ${row.itemName} flash sale`}>End sale</Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {target && (
        <ConfirmDialog
          title="End flash sale"
          summary={`${target.itemName} at ${target.businessName}. Customers see the normal price straight away and the seller is notified.`}
          confirmLabel="End sale"
          danger
          busy={end.isPending}
          error={error}
          onConfirm={(reason) => end.mutate({ id: target.id, reason })}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}
