import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import SchedulePicker from "../../components/SchedulePicker.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { cancelOutcome } from "../../lib/messaging.js";
import { formatNairobiDateTime, nairobiInputToUtcIso, stampNairobi } from "../../lib/time.js";
import { scheduleProblem, toNairobiInput } from "../../lib/schedule.js";
import { BROADCAST_ERRORS } from "../../lib/messaging.js";

const CHANNEL = { sms: "SMS", email: "Email", in_app: "In-app" };

export default function PendingBroadcasts() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const [moving, setMoving] = useState(null); // { batch, when, now }: when is "" for Send now
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

  const move = useMutation({
    mutationFn: ({ batch, when }) => api.rescheduleBroadcast({ batchId: batch.batch_id, scheduledAt: when ? nairobiInputToUtcIso(when) : new Date().toISOString() }),
    onSuccess: (result, { when }) => {
      setMoving(null);
      toast.push({ message: when ? `Rescheduled for ${formatNairobiDateTime(result.scheduledAt)}.` : "Sending now. It goes out within a minute." });
      queryClient.invalidateQueries({ queryKey: ["admin-pending-broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-message-log"] });
    },
  });

  if (!data.length) return null;
  return (
    <section className="pending" aria-label="Broadcasts waiting to send">
      <h3 className="heading-flow">Waiting to send</h3>
      <div className="table-shell">
        <table data-cards>
          <thead><tr><th scope="col">Message</th><th scope="col">Goes out</th><th scope="col">Waiting</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.batch_id} data-testid="pending-broadcast">
                <td data-label="Message">
                  <strong>{b.subject}</strong>
                  <div className="muted">{b.channels.map((c) => CHANNEL[c] ?? c).join(", ")} · {b.recipients} {b.recipients === 1 ? "recipient" : "recipients"}{b.template_key ? ` · ${b.template_key}` : ""}</div>
                </td>
                <td data-label="Goes out">{stampNairobi(b.scheduled_at)}</td>
                <td data-label="Waiting">{b.pending} of {b.total}</td>
                <td className="row-actions" data-label="Actions">
                  <Button size="sm" disabled={!canCancel} title={why("messages.send")} onClick={() => { move.reset(); setMoving({ batch: b, when: toNairobiInput(new Date(Date.parse(b.scheduled_at) || Date.now())) }); }} aria-label={`Change time of ${b.subject}`}>Change time</Button>
                  <Button size="sm" disabled={!canCancel} title={why("messages.send")} onClick={() => { cancel.reset(); setTarget(b); }} aria-label={`Cancel broadcast ${b.subject}`}>Cancel</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {moving ? (
        <ConfirmDialog
          title="Change when this goes out"
          summary={`${moving.batch.pending} of ${moving.batch.total} messages are still waiting. Pick a new time, or send them now. Messages already sent are not affected.`}
          confirmLabel={moving.when ? "Save new time" : "Send now"}
          valid={!scheduleProblem(moving.when)}
          busy={move.isPending}
          error={move.isError ? BROADCAST_ERRORS[move.error?.code] ?? move.error?.message : ""}
          onConfirm={() => move.mutate({ batch: moving.batch, when: moving.when })}
          onCancel={() => setMoving(null)}
        >
          <SchedulePicker label="New time (Nairobi time)" value={moving.when} onChange={(when) => setMoving((m) => ({ ...m, when }))} />
        </ConfirmDialog>
      ) : null}
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
