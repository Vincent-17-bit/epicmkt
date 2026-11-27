import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@epicmkt/shared";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { friendlyError } from "../../lib/businessDetail.js";
import { describeEntry } from "../../lib/contactHistory.js";

// The numbers and emails a business had before. A seller changing them never erases the old ones: they are kept here, and only the owner can remove one.
export default function ContactHistory({ id }) {
  const { can, why } = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const rows = useQuery({ queryKey: ["admin-contact-history", id], queryFn: () => api.getContactHistory(id), enabled: can("businesses.view") });

  const remove = useMutation({
    mutationFn: () => api.deleteContactHistory(removing.id),
    onSuccess: () => {
      setRemoving(null);
      setError("");
      toast.push({ message: "Removed from the history." });
      client.invalidateQueries({ queryKey: ["admin-contact-history", id] });
    },
    onError: (failure) => setError(friendlyError(failure)),
  });

  if (!can("businesses.view") || rows.isPending) return null;
  if (rows.isError) return <p role="alert" className="muted">The number and email history could not be loaded.</p>;
  const list = rows.data ?? [];

  return (
    <section aria-labelledby="contact-history-title">
      <h3 id="contact-history-title" className="heading-flow">Previous numbers and emails</h3>
      <p className="muted">Kept for the record when a seller or an admin changes them. Only the owner can remove an entry.</p>
      {list.length === 0 ? (
        <p>No changes yet.</p>
      ) : (
        <ul className="biz-history">
          {list.map((entry) => {
            const d = describeEntry(entry);
            return (
              <li key={entry.id}>
                <div>
                  <strong>{d.label}</strong>: <span>{d.from}</span> <span aria-hidden="true">&rarr;</span><span className="sr-only"> changed to </span> <span>{d.to}</span>
                  <div className="muted">{formatDateTime(entry.at)}, {d.who}</div>
                </div>
                <Button
                  className="admin-button--danger"
                  disabled={!can("businesses.contact_history_delete")}
                  title={why("businesses.contact_history_delete")}
                  aria-label={`Remove the old ${d.label.toLowerCase()} ${d.from} from the history`}
                  onClick={() => { setError(""); setRemoving(entry); }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {removing ? (
        <ConfirmDialog
          title="Remove this from the history?"
          summary={`The old ${describeEntry(removing).label.toLowerCase()} ${describeEntry(removing).from} will be erased for good. The removal is recorded in the audit log.`}
          confirmLabel="Remove"
          danger
          busy={remove.isPending}
          error={error}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </section>
  );
}
