import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { cancelOutcome } from "../../lib/messaging.js";
import { stampNairobi } from "../../lib/time.js";

const CHANNEL = { sms: "SMS", email: "Email", in_app: "In-app" };

export default function PendingBroadcasts() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const { data = [] } = useQuery({ queryKey: ["admin-pending-broadcasts"], queryFn: () => api.listPendingBroadcasts(), refetchInterval: 30_000 });
  const canCancel = can("messages.send");

  const cancel = useMutation({
    mutationFn: ({ batch, reason }) => api.cancelBroadcast({ batchId: batch.batch_id, reason }),
    onSuccess: (result) => {
      setTarget(null);
      toast.push({ message: cancelOutcome(result) });
      queryClient.invalidateQueries({ queryKey: ["admin-pending-broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-log"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-summary"] });
    },
  });

  if (!data.length) return null;
  return (
    <section className="pending" aria-label="Broadcasts waiting to send">
      <h3 className="heading-flow">Waiting to send</h3>
      <div className="table-shell">
        <table>
          <thead><tr><th scope="col">Message</th><th scope="col">Goes out</th><th scope="col">Waiting</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.batch_id} data-testid="pending-broadcast">
                <td>
                  <strong>{b.subject}</strong>
                  <div className="muted">{b.channels.map((c) => CHANNEL[c] ?? c).join(", ")} · {b.recipients} {b.recipients === 1 ? "recipient" : "recipients"}{b.template_key ? ` · ${b.template_key}` : ""}</div>
                </td>
                <td>{stampNairobi(b.scheduled_at)}</td>
                <td>{b.pending} of {b.total}</td>
                <td><Button size="sm" disabled={!canCancel} title={why("messages.send")} onClick={() => { cancel.reset(); setTarget(b); }} aria-label={`Cancel broadcast ${b.subject}`}>Cancel</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {target ? (
        <ConfirmDialog
          title="Cancel this broadcast?"
          summary={`${target.pending} of ${target.total} messages have not gone out yet and will be cancelled. Messages already sent stay sent.`}
          confirmLabel="Cancel broadcast"
          danger
          busy={cancel.isPending}
          error={cancel.isError ? cancel.error.message : ""}
          onConfirm={(reason) => cancel.mutate({ batch: target, reason })}
          onCancel={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}
