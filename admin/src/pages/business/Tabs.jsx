import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { errorMessage } from "../../lib/errors.js";
import EmptyState from "../../components/EmptyState.jsx";
import { DAY_ORDER, bytes, dayHours, describeException, fmtDate, fmtDateTime, fmtKes, humanAction, slotLabel } from "./format.js";

function useTab(id, tab) {
  return useQuery({ queryKey: ["admin-business-tab", id, tab], queryFn: () => api.getBusinessTab(id, tab) });
}

function State({ query, children, empty }) {
  if (query.isLoading) return <div className="tab-loading" aria-busy="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>;
  if (query.isError) return <p className="form-error" role="alert">{errorMessage(query.error)} <button type="button" className="link-button" onClick={() => query.refetch()}>Try again</button></p>;
  const data = query.data;
  if (Array.isArray(data) ? data.length === 0 : false) return empty;
  return children(data);
}

const Pill = ({ tone = "muted", children }) => <span className={`status-pill status-pill--${tone}`}>{children}</span>;
const PAY_TONE = { confirmed: "good", submitted: "warn", rejected: "danger" };
const MSG_TONE = { delivered: "good", sent: "good", queued: "warn", failed: "danger" };

export function DocumentsTab({ id }) {
  const q = useTab(id, "documents");
  return (
    <State query={q}>
      {(d) => !d.application_id ? (
        <EmptyState title="No application on file" icon="📄">This business was created without an application, so there are no documents.</EmptyState>
      ) : (
        <>
          <p className="muted">From application <strong>{d.reference_no ?? "—"}</strong>. Identity numbers and file locations are not shown here. Open a file from the application review, which records who viewed it.</p>
          {d.documents.length === 0 ? <EmptyState title="No documents uploaded" icon="📄" /> : (
            <ul className="doc-list">
              {d.documents.map((x) => (
                <li key={x.id} className="doc-list__row">
                  <div><strong>{slotLabel(x.slot_key)}</strong><span className="muted"> · {x.original_name} · {bytes(x.size_bytes)}</span></div>
                  <Pill tone={x.verified ? "good" : "warn"}>{x.verified ? "Verified" : "Not verified"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </State>
  );
}

export function PaymentsTab({ id }) {
  const q = useTab(id, "payments");
  return (
    <State query={q} empty={<EmptyState title="No payments yet" icon="💳">Payments appear here once the seller submits an M-Pesa code or an admin records one.</EmptyState>}>
      {(rows) => (
        <div className="table-shell"><table className="dt">
          <thead><tr><th>Date</th><th>M-Pesa code</th><th>Receipt</th><th className="num">Amount</th><th>Kind</th><th>Months</th><th>Status</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td>{fmtDateTime(p.submitted_at ?? p.created_at)}</td><td>{p.mpesa_code ?? "—"}</td><td>{p.receipt_no ?? "—"}</td>
              <td className="num">{fmtKes(p.amount_kes)}</td><td>{p.kind}</td><td>{p.months ?? 1}</td>
              <td><Pill tone={PAY_TONE[p.status]}>{p.status}</Pill>{p.decline_reason ? <div className="muted">{p.decline_reason}</div> : null}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </State>
  );
}

export function MessagesTab({ id, onCompose, canCompose }) {
  const q = useTab(id, "messages");
  return (
    <>
      <div className="tab-actions"><button type="button" className="primary-button" onClick={onCompose} disabled={!canCompose} title={canCompose ? undefined : "Your role cannot message sellers"}>New message</button></div>
      <State query={q} empty={<EmptyState title="No messages sent" icon="✉">In-app notices, SMS and email to this seller are listed here.</EmptyState>}>
        {(rows) => (
          <ul className="feed">
            {rows.map((m) => (
              <li key={m.id} className="feed__row">
                <div className="feed__head"><strong>{m.subject || (m.channel === "sms" ? "SMS" : "Message")}</strong>
                  <span><Pill>{m.channel.replace("_", "-")}</Pill> <Pill tone={MSG_TONE[m.status]}>{m.status}</Pill></span></div>
                <p>{m.body}</p>
                <span className="muted">{fmtDateTime(m.sent_at ?? m.created_at)}{m.to_address ? ` · to ${m.to_address}` : ""}{m.error ? ` · ${m.error}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </State>
    </>
  );
}

export function ActivityTab({ id }) {
  const q = useTab(id, "activity");
  return (
    <State query={q} empty={<EmptyState title="No activity recorded" icon="🕘">Every admin and seller action on this business is logged here, newest first.</EmptyState>}>
      {(rows) => (
        <ol className="timeline">
          {rows.map((a) => (
            <li key={a.id} className="timeline__row">
              <span className="timeline__dot" aria-hidden="true" />
              <div>
                <strong>{humanAction(a.action)}</strong> <span className="muted">by {a.actor_email ?? a.actor_role} · {fmtDateTime(a.created_at)}</span>
                {a.reason ? <p className="timeline__reason">“{a.reason}”</p> : null}
                {a.before && a.after ? <p className="muted">{Object.keys(a.after).filter((k) => JSON.stringify(a.before[k]) !== JSON.stringify(a.after[k])).map((k) => `${k.replace(/_/g, " ")}: ${a.before[k] ?? "—"} → ${a.after[k] ?? "—"}`).join(" · ")}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </State>
  );
}

export function NotesTab({ id }) {
  const q = useTab(id, "notes");
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => { client.invalidateQueries({ queryKey: ["admin-business-tab", id, "notes"] }); client.invalidateQueries({ queryKey: ["admin-business-tab", id, "activity"] }); };
  const add = useMutation({ mutationFn: () => api.addBusinessNote(id, body, pin), onSuccess: () => { setBody(""); setPin(false); setError(""); refresh(); }, onError: (e) => setError(errorMessage(e)) });
  const toggle = useMutation({ mutationFn: (n) => api.setBusinessNotePinned(n.id, !n.pinned), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const del = useMutation({ mutationFn: (n) => api.deleteBusinessNote(n.id), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  return (
    <>
      <form className="note-form" onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }}>
        <label className="field"><span>Internal note (never shown to the seller or customers)</span>
          <textarea rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="note-form__row">
          <label className="check"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Pin to the top</label>
          <button type="submit" className="primary-button" disabled={!body.trim() || add.isPending}>{add.isPending ? "Saving…" : "Add note"}</button>
        </div>
        <div aria-live="polite">{error ? <p className="form-error" role="alert">{error}</p> : null}</div>
      </form>
      <State query={q} empty={<EmptyState title="No notes yet" icon="🗒">Leave context for the next admin: calls made, promises, things to watch.</EmptyState>}>
        {(rows) => (
          <ul className="feed">
            {rows.map((n) => (
              <li key={n.id} className={`feed__row ${n.pinned ? "is-pinned" : ""}`}>
                <div className="feed__head"><span className="muted">{n.pinned ? "📌 " : ""}{n.author_email ?? "Admin"} · {fmtDateTime(n.created_at)}</span>
                  <span><button type="button" className="link-button" onClick={() => toggle.mutate(n)}>{n.pinned ? "Unpin" : "Pin"}</button>{" "}
                    <button type="button" className="link-button link-button--danger" onClick={() => window.confirm("Delete this note?") && del.mutate(n)}>Delete</button></span></div>
                <p className="pre">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </State>
    </>
  );
}

// Hours come from the business row already loaded by the page, so this tab needs no request.
export function HoursTab({ business }) {
  const exceptions = [...(business.exceptions ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const partial = business.partial_closures ?? [];
  return (
    <div className="two-col">
      <section>
        <h4>Weekly hours (Nairobi time)</h4>
        {business.hours && Object.keys(business.hours).length ? (
          <dl className="hours">{DAY_ORDER.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{dayHours(business.hours[k])}</dd></div>)}</dl>
        ) : <EmptyState title="No weekly hours set" icon="🕘">The seller has not set opening hours yet.</EmptyState>}
        {business.override ? <p className="notice">An override is active: <code>{JSON.stringify(business.override)}</code></p> : null}
      </section>
      <section>
        <h4>Upcoming closures and special hours</h4>
        {exceptions.length === 0 ? <p className="muted">None scheduled.</p> : (
          <ul className="feed">{exceptions.map((e) => <li key={e.id ?? e.date} className="feed__row"><strong>{fmtDate(e.date)}</strong> · {describeException(e)}{e.note ? <span className="muted"> · {e.note}</span> : null}</li>)}</ul>
        )}
        <h4>Partial closures</h4>
        {partial.length === 0 ? <p className="muted">None active.</p> : (
          <ul className="feed">{partial.map((p, i) => <li key={i} className="feed__row"><strong>{p.scope}{p.section ? ` · ${p.section}` : ""}</strong> until {fmtDateTime(p.until)}</li>)}</ul>
        )}
        <p className="muted">Read-only. Only the seller changes their hours.</p>
      </section>
    </div>
  );
}

export function TeamTab({ id }) {
  const q = useTab(id, "team");
  if (q.isLoading || q.isError) return <State query={q}>{() => null}</State>;
  const { staff = [], timetable = [] } = q.data ?? {};
  if (!staff.length && !timetable.length) return <EmptyState title="No team or timetable" icon="👥">Staff and class timetables appear here when the seller adds them.</EmptyState>;
  const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="two-col">
      <section><h4>Team</h4><ul className="feed">{staff.map((s) => <li key={s.id} className="feed__row"><strong>{s.name}</strong>{s.role ? ` · ${s.role}` : ""}{s.hidden_by_admin ? <> <Pill tone="warn">Hidden</Pill></> : null}</li>)}</ul></section>
      <section><h4>Timetable</h4><ul className="feed">{timetable.map((t) => <li key={t.id} className="feed__row"><strong>{DAYS[t.day_of_week]} {String(t.start_time).slice(0, 5)} to {String(t.end_time).slice(0, 5)}</strong> · {t.class_name}</li>)}</ul></section>
    </div>
  );
}

// Items, FAQs, Offers, Gallery and Flags belong to B3c.
export function LaterTab({ label }) {
  return <EmptyState title={`${label} are coming next`} icon="🚧">This tab is reserved for the next step (B3c). Nothing is lost: the data is already stored and will appear here.</EmptyState>;
}
