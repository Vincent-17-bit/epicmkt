import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { useActivityDelete } from "../hooks/useActivityDelete.js";
import { describeError } from "../lib/applications.js";
import { describeActivity } from "../lib/activity.js";
import { clearSummary, clearedMessage, removeRows } from "../lib/activityDelete.js";
import { timeAgo } from "../lib/time.js";
import Button from "./Button.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

export const ACTIVITY_KEY = ["admin-activity"];
const noRows = [];

// The "Live activity" panel of the Command Center: the feed, a delete button on every row and "Clear all".
// Notifications are deleted for good; audit rows are only hidden from this admin's feed (migration 0059).
export default function LiveActivityPanel({ undoMs }) {
  const client = useQueryClient();
  const toast = useToast();
  const { can, why } = usePermissions();
  const canView = can("activity.view");
  const canManage = can("activity.manage");

  const activity = useQuery({
    queryKey: ACTIVITY_KEY,
    queryFn: () => api.getAdminActivity({ limit: 15 }),
    enabled: canView,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
  const { remove, hiddenIds } = useActivityDelete({ queryKey: ACTIVITY_KEY, undoMs });

  // Rows still waiting out their Undo window stay out of the list even if a refetch brings them back.
  const rows = (activity.data ?? noRows).filter((row) => !hiddenIds.has(row.id));

  // The rows the dialog was opened for. "Clear all" removes exactly these, and the dialog describes exactly these,
  // even if the list refreshes while the admin is typing the reason.
  const [confirmRows, setConfirmRows] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  // Set once the admin has deleted or cleared something here. It only matters when the list is empty: then the message
  // says "you cleared it" instead of "nothing has happened yet".
  const [cleared, setCleared] = useState(false);

  const clearAll = async (reason) => {
    const ids = confirmRows.map((row) => row.id);
    setClearing(true);
    setClearError("");
    try {
      const result = await api.deleteAdminActivity({ ids, reason });
      client.setQueryData(ACTIVITY_KEY, (current) => removeRows(current, ids));
      client.invalidateQueries({ queryKey: ACTIVITY_KEY }); // older rows, if there are any, take their place
      setCleared(true);
      setConfirmRows(null);
      toast.push({ message: clearedMessage(result) });
    } catch (error) {
      setClearError(describeError(error)); // nothing was removed: the rows stay and the dialog says why
    } finally {
      setClearing(false);
    }
  };

  const clearDisabled = !canManage || rows.length === 0;
  const clearHint = !canManage ? why("activity.manage") : rows.length === 0 ? "There is nothing to clear." : undefined;

  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Live activity</h3>
        {canView ? (
          <Button size="sm" disabled={clearDisabled} title={clearHint} onClick={() => { setClearError(""); setConfirmRows(rows); }}>
            Clear all
          </Button>
        ) : null}
      </div>

      {!canView ? (
        <p className="muted">{why("activity.view")}</p>
      ) : activity.isPending ? (
        <p className="muted">Loading activity</p>
      ) : activity.isError && !activity.data ? (
        <div className="banner banner--error" role="alert">
          <span>Could not load the activity. {describeError(activity.error)}</span>
          <button type="button" className="secondary-button admin-button--sm" onClick={() => activity.refetch()} disabled={activity.isFetching}>
            {activity.isFetching ? "Retrying" : "Try again"}
          </button>
        </div>
      ) : rows.length ? (
        <ul className="activity-list">
          {rows.map((row) => {
            const { text, to } = describeActivity(row);
            return (
              <li key={row.id}>
                <div className="activity-list__main">
                  {to ? <Link to={to}>{text}</Link> : <span>{text}</span>}
                  {row.at ? <time className="muted" dateTime={row.at}> · {timeAgo(row.at)}</time> : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="activity-list__delete"
                    aria-label={`Delete: ${text}`}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); setCleared(true); remove(row); }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : cleared ? (
        <p className="muted">You have cleared the feed. New applications, payments and seller requests show up here as they arrive.</p>
      ) : (
        <p className="muted">Nothing has happened yet. New applications, payments and seller requests show up here as they arrive.</p>
      )}

      {confirmRows ? (
        <ConfirmDialog
          title="Clear the live activity list?"
          summary={clearSummary(confirmRows)}
          confirmLabel="Clear all"
          danger
          busy={clearing}
          error={clearError}
          onConfirm={clearAll}
          onCancel={() => setConfirmRows(null)}
        />
      ) : null}
    </section>
  );
}
