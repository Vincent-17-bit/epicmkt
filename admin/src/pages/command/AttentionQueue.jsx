import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { startReview } from "../../api/index.js";
import { Button, Card, Skeleton } from "../../components/index.js";
import Icon from "../../components/Icon.jsx";
import { useToast } from "../../components/Toast.jsx";
import { attentionItems } from "../../lib/attention.js";
import { useLiveStore } from "../../state/liveStore.js";
import s from "./command.module.css";

/**
 * The work, one row per kind, most urgent first. Inline actions: "Start review" takes the oldest waiting application
 * (the database moves it to under review for you), the other rows jump straight to a filtered list, and any row can be
 * snoozed for an hour on this browser. Snoozing hides a row; it never changes the data or anyone else's view.
 */
export default function AttentionQueue({ counts, oldest, can, loading }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const snoozed = useLiveStore((state) => state.snoozed);
  const { snooze, unsnooze } = useLiveStore.getState();
  const [showSnoozed, setShowSnoozed] = useState(false);

  const review = useMutation({
    mutationFn: (applicationId) => startReview(applicationId),
    onSuccess: (_status, _id, _ctx) => {
      for (const key of ["admin-counts", "dashboard"]) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast.error(error.message),
  });

  const all = attentionItems(counts, oldest, { can, snoozed });
  const open = all.filter((row) => !row.snoozed);
  const hidden = all.filter((row) => row.snoozed);
  const rows = showSnoozed ? all : open;

  const run = (row) => {
    if (row.action.kind === "startReview") review.mutate(row.action.applicationId, { onSuccess: () => navigate(row.action.to) });
    else navigate(row.action.to);
  };

  return (
    <Card as="section" title="Needs your attention" headingLevel={2} className={s.span7} aria-busy={loading || undefined}
      actions={open.length > 0 ? <span className={s.panelNote}>{open.length} {open.length === 1 ? "area" : "areas"}</span> : null}>
      {loading ? (
        <div className={s.skeletonRows}><Skeleton variant="rect" height="3rem" /><Skeleton variant="rect" height="3rem" /><Skeleton variant="rect" height="3rem" /></div>
      ) : rows.length === 0 ? (
        <p className={s.allClear}><Icon name="check" size="lg" /> Nothing needs you right now.</p>
      ) : (
        <ul className={s.list}>
          {rows.map((row) => (
            <li key={row.id} className={s.row} data-tone={row.tone} data-snoozed={row.snoozed || undefined}>
              <span className={s.count} aria-hidden="true">{row.count}</span>
              <div className={s.rowBody}>
                <p className={s.rowTitle}><span className="sr-only">{row.count} </span>{row.title}</p>
                {row.detail ? <p className={s.rowDetail}>{row.detail}</p> : null}
                {row.tone === "danger" ? <span className={s.rowFlag}><Icon name="warn" /> Overdue</span> : null}
                {row.snoozed ? <span className={s.rowDetail}>Snoozed for now</span> : null}
              </div>
              <div className={s.rowActions}>
                {row.snoozed ? (
                  <Button size="sm" variant="ghost" onClick={() => unsnooze(row.id)}>Unsnooze</Button>
                ) : (
                  <>
                    <Button size="sm" variant="primary" loading={review.isPending && row.action.kind === "startReview"} onClick={() => run(row)}>{row.action.label}</Button>
                    <Button size="sm" variant="ghost" aria-label={`Snooze ${row.title} for 1 hour`} onClick={() => snooze(row.id)}>Snooze 1 h</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && hidden.length > 0 ? (
        <div className={s.snoozeBar}>
          <span>{hidden.length} snoozed</span>
          <Button size="sm" variant="ghost" onClick={() => setShowSnoozed((v) => !v)} aria-pressed={showSnoozed}>{showSnoozed ? "Hide snoozed" : "Show snoozed"}</Button>
        </div>
      ) : null}
    </Card>
  );
}
