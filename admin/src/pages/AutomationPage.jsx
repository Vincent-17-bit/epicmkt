import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import LoadError from "../components/LoadError.jsx";
import { useToast } from "../components/Toast.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import { HEALTH_LABEL, JOB_INFO, ago, automationHealth } from "../lib/messaging.js";

export default function AutomationPage() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const { data: status, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-automation"], queryFn: () => api.getAutomationStatus(), refetchInterval: 20_000 });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-automation"] });
  const toggle = useMutation({
    mutationFn: ({ name, active }) => api.setJobActive({ name, active }),
    onSuccess: (_, v) => { toast.push({ message: v.active ? "Job resumed." : "Job paused. Nothing will run until you resume it." }); refresh(); },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
    onSettled: () => setBusy(""),
  });
  const run = useMutation({
    mutationFn: (name) => api.runJob(name),
    onSuccess: () => { toast.push({ message: "Started. Give it a few seconds, then check the last run." }); setTimeout(refresh, 4000); },
    onError: (failure) => toast.push({ message: failure.message, tone: "error" }),
    onSettled: () => setBusy(""),
  });

  const health = automationHealth(status);
  const manage = can("automation.manage");
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Automation</h2>
          {status ? <span className={`status-pill status-pill--${health.level === "healthy" ? "healthy" : health.level === "down" ? "down" : "degraded"}`}>{HEALTH_LABEL[health.level]}</span> : null}
        </div>
        <p className="muted">Two scheduled jobs keep messages and renewals moving. If they stop, nothing tells the sellers.</p>

        {isError ? <LoadError what="the automation status" error={error} onRetry={refetch} /> : isLoading ? <p>Loading…</p> : (
          <>
            {health.problems.length > 0 && (
              <ul className="automation-problems" aria-label="Problems">
                {health.problems.map((p, i) => (
                  <li key={i} className={`automation-problem automation-problem--${p.level}`}>
                    <strong>{p.text}</strong>
                    {p.fix ? <div>{p.fix}</div> : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="table-shell">
              <table>
                <thead><tr><th scope="col">Job</th><th scope="col">Runs</th><th scope="col">State</th><th scope="col">Last run</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {(status.expected ?? []).map((name) => {
                    const job = status.jobs.find((j) => j.name === name);
                    const info = JOB_INFO[name] ?? { label: name, every: "", what: "" };
                    return (
                      <tr key={name}>
                        <td><strong>{info.label}</strong><div className="muted">{info.what}</div></td>
                        <td>{info.every}{job ? <div className="muted">{job.schedule} UTC</div> : null}</td>
                        <td>{!job ? <span className="status-pill status-pill--down">Not scheduled</span> : job.active ? <span className="status-pill status-pill--healthy">Active</span> : <span className="status-pill status-pill--degraded">Paused</span>}</td>
                        <td>
                          {job?.last_run ? <>{ago(job.last_run.started_at)}<div className={job.last_run.status === "failed" ? "text-danger" : "muted"}>{job.last_run.status}{job.last_run.message ? `: ${job.last_run.message}` : ""}</div></> : "Never"}
                        </td>
                        <td className="row-actions">
                          {job && (
                            <Button size="sm" disabled={!manage || busy === name} title={why("automation.manage")} onClick={() => { setBusy(name); toggle.mutate({ name, active: !job.active }); }} aria-label={`${job.active ? "Pause" : "Resume"} ${info.label}`}>{job.active ? "Pause" : "Resume"}</Button>
                          )}
                          <Button size="sm" disabled={!manage || busy === name} title={why("automation.manage")} onClick={() => { setBusy(name); run.mutate(name); }} aria-label={`Run now: ${info.label}`}>Run now</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3>Message queue</h3>
            <p>
              <strong>{status.queue.queued}</strong> queued, <strong>{status.queue.due_now}</strong> due now, <strong className={status.queue.failed_7d ? "text-danger" : ""}>{status.queue.failed_7d}</strong> failed in 7 days. Last sent {ago(status.last_sent_at)}; last reminder queued {ago(status.last_reminder_at)}.{" "}
              <Link to="/admin/broadcasts?tab=log">Open the message log</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
