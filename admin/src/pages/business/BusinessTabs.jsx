import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { auditLabel, friendlyError, kes } from "../../lib/businessDetail.js";
import { daysLeft, formatBusinessDate, formatDate, formatDateTime, timeAgo } from "../../lib/time.js";

const PAYMENT_STATUS = { confirmed: "Confirmed", submitted: "Submitted", awaiting_confirmation: "Awaiting confirmation", needs_assignment: "Needs assignment", rejected: "Rejected", ignored: "Ignored" };
const label = (map, key) => map[key] ?? String(key ?? "").replace(/_/g, " ");

function Query({ query, empty, children }) {
  if (query.isPending) return <p className="muted">Loading…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="biz-error">
        {friendlyError(query.error, "We could not load this.")}{" "}
        <button type="button" className="admin-bell__markall" onClick={() => query.refetch()}>Try again</button>
      </p>
    );
  }
  const list = Array.isArray(query.data) ? query.data : null;
  if (list && list.length === 0) return <p className="muted">{empty}</p>;
  return children(query.data);
}

const Field = ({ name, children }) => (
  <div className="biz-field"><dt>{name}</dt><dd>{children || <span className="muted">Not set</span>}</dd></div>
);

// ---- Overview ----------------------------------------------------------------------------------------------------
export function OverviewTab({ detail }) {
  const b = detail.business;
  const s = detail.stats;
  const left = b.paid_until ? daysLeft(b.paid_until) : null;
  const { can } = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const [graceOpen, setGraceOpen] = useState(false);
  const [graceInput, setGraceInput] = useState("");
  const [graceError, setGraceError] = useState("");
  const overridden = b.grace_days !== null && b.grace_days !== undefined;
  const graceNow = b.grace_days ?? b.grace_default ?? 1;
  const graceValid = graceInput === "" || (/^\d+$/.test(graceInput) && Number(graceInput) <= 90);

  const changeGrace = useMutation({
    mutationFn: ({ days, reason }) => api.setBusinessGrace({ id: b.id, days, reason }),
    onSuccess: () => {
      setGraceOpen(false);
      toast.push({ message: "Grace period updated." });
      client.invalidateQueries({ queryKey: ["admin-business", b.id] });
      client.invalidateQueries({ queryKey: ["admin-business-activity", b.id] });
      client.invalidateQueries({ queryKey: ["business-table"] });
      client.invalidateQueries({ queryKey: ["admin-counts"] });
    },
    onError: (failure) => setGraceError(failure?.message && failure.message !== failure.code ? failure.message : friendlyError(failure)),
  });

  return (
    <div className="biz-overview">
      <ul className="biz-stats" aria-label="Summary">
        <li><strong>{s.items}</strong><span>Items listed</span></li>
        <li><strong>{s.items_hidden}</strong><span>Hidden by admin</span></li>
        <li><strong>{s.open_flags}</strong><span>Open flags</span></li>
        <li><strong>{s.open_reports}</strong><span>Open reports</span></li>
        <li><strong>{kes(s.paid_total_kes)}</strong><span>Paid in total</span></li>
        <li><strong>{s.payments_waiting}</strong><span>Payments waiting</span></li>
      </ul>
      <div className="biz-columns">
        <section>
          <h3 className="heading-flow">Owner and contact</h3>
          <dl className="biz-fields">
            <Field name="Owner">{b.owner_name}</Field>
            <Field name="Phone">{b.phone}</Field>
            <Field name="WhatsApp">{b.whatsapp}</Field>
            <Field name="Email">{b.email}</Field>
          </dl>
        </section>
        <section>
          <h3 className="heading-flow">Location</h3>
          <dl className="biz-fields">
            <Field name="County">{b.county}</Field>
            <Field name="Town">{b.town}</Field>
            <Field name="Address">{b.address}</Field>
            <Field name="Category">{b.category_name}</Field>
          </dl>
        </section>
        <section>
          <h3 className="heading-flow">Subscription</h3>
          <dl className="biz-fields">
            <Field name="Plan">{b.plan_key ? `${b.plan_key[0].toUpperCase()}${b.plan_key.slice(1)}` : ""}</Field>
            <Field name="Monthly price">{b.monthly_price ? kes(b.monthly_price) : ""}</Field>
            <Field name="Paid until">{b.paid_until ? `${formatBusinessDate(b.paid_until)} (${left < 0 ? `${-left} day${left === -1 ? "" : "s"} ago` : `${left} day${left === 1 ? "" : "s"} left`})` : ""}</Field>
            <Field name="Grace period">
              {`${graceNow} day${graceNow === 1 ? "" : "s"} (${overridden ? "set for this business" : "default"})`}
              {can("businesses.extend") && !b.deleted_at ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="admin-bell__markall"
                    onClick={() => { setGraceInput(overridden ? String(b.grace_days) : ""); setGraceError(""); setGraceOpen(true); }}
                  >
                    Change
                  </button>
                </>
              ) : null}
            </Field>
            <Field name="First paid">{formatDate(b.first_paid_at)}</Field>
            <Field name="Credit">{b.credit_kes ? kes(b.credit_kes) : ""}</Field>
          </dl>
        </section>
        <section>
          <h3 className="heading-flow">History</h3>
          <dl className="biz-fields">
            <Field name="Joined">{formatDate(b.created_at)}</Field>
            <Field name="Last sign-in">{b.last_login_at ? `${formatDateTime(b.last_login_at)} (${timeAgo(b.last_login_at)})` : ""}</Field>
            <Field name="Last edit">{b.last_edit_at ? timeAgo(b.last_edit_at) : ""}</Field>
            <Field name="Tags">{b.tags?.length ? b.tags.join(", ") : ""}</Field>
            {b.status_reason ? <Field name="Reason for status">{b.status_reason}</Field> : null}
          </dl>
        </section>
      </div>
      {b.tagline || b.description ? <p className="muted">{b.tagline} {b.description}</p> : null}
      {graceOpen ? (
        <ConfirmDialog
          title={`Grace period for ${b.name}`}
          summary="After the paid date the shop stays visible for this many days. Then it is hidden from customers until a payment is confirmed."
          confirmLabel="Save grace period"
          valid={graceValid}
          busy={changeGrace.isPending}
          error={graceError}
          onCancel={() => setGraceOpen(false)}
          onConfirm={(reason) => { setGraceError(""); changeGrace.mutate({ days: graceInput === "" ? null : Number(graceInput), reason }); }}
        >
          <label className="field">
            Days of grace (0 to 90)
            <input type="number" min="0" max="90" step="1" inputMode="numeric" value={graceInput} onChange={(event) => setGraceInput(event.target.value)} />
          </label>
          <p className="muted">Leave empty to use the default of {b.grace_default ?? 1} day{(b.grace_default ?? 1) === 1 ? "" : "s"}.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

// ---- Payments ----------------------------------------------------------------------------------------------------
export function PaymentsTab({ id }) {
  const query = useQuery({ queryKey: ["admin-business-payments", id], queryFn: () => api.getBusinessPayments(id), retry: false });
  return (
    <Query query={query} empty="No payments yet.">
      {(rows) => (
        <div className="biz-table-wrap">
          <table className="biz-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Type</th><th scope="col">M-Pesa code</th><th scope="col">Receipt</th><th scope="col">Covers until</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.created_at)}</td>
                  <td>{kes(p.amount_kes)}{p.months ? <span className="muted"> · {p.months} mo</span> : null}</td>
                  <td>{label(PAYMENT_STATUS, p.status)}{p.decline_reason ? <span className="muted"> ({p.decline_reason})</span> : null}</td>
                  <td>{label({}, p.kind)}</td>
                  <td>{p.mpesa_code ? <Link to={`/admin/payments?q=${encodeURIComponent(p.mpesa_code)}`}>{p.mpesa_code}</Link> : "—"}</td>
                  <td>{p.receipt_no ?? "—"}</td>
                  <td>{p.period_end ? formatBusinessDate(p.period_end) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Query>
  );
}

// ---- Items (moderation) ------------------------------------------------------------------------------------------
export function ItemsTab({ id }) {
  const { can, why } = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["admin-business-items", id], queryFn: () => api.getBusinessItems(id), retry: false });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-business-items", id] });
    client.invalidateQueries({ queryKey: ["admin-business", id] });
    client.invalidateQueries({ queryKey: ["admin-business-activity", id] });
  };
  const hide = useMutation({
    mutationFn: ({ item, hidden, reason }) => api.setItemHidden({ id: item.id, hidden, reason }),
    onSuccess: (_r, { hidden, item }) => {
      setTarget(null);
      setError("");
      toast.push({ message: hidden ? `Hid “${item.name}”. The seller has been told.` : `“${item.name}” is visible again.` });
      refresh();
    },
    onError: (e) => {
      setError(friendlyError(e));
      refresh();
    },
  });
  const price = (i) => (i.price_type === "fixed" && i.price !== null ? kes(i.price) : label({}, i.price_type));
  const canModerate = can("moderation.resolve");
  return (
    <>
      <Query query={query} empty="This business has no items.">
        {(rows) => (
          <div className="biz-table-wrap">
            <table className="biz-table">
              <thead><tr><th scope="col">Item</th><th scope="col">Section</th><th scope="col">Price</th><th scope="col">Customers see it?</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{i.section ?? "—"}</td>
                    <td>{price(i)}{i.sale_price ? <span className="muted"> · sale {kes(i.sale_price)}</span> : null}</td>
                    <td>
                      {i.hidden_by_admin ? <span className="chip chip--black">Hidden by admin</span> : i.draft ? <span className="chip chip--neutral">Draft</span> : i.visible ? <span className="chip chip--live">Visible</span> : <span className="chip chip--neutral">Hidden by seller</span>}
                      {i.hidden_by_admin && i.admin_hide_reason ? <div className="muted">{i.admin_hide_reason}</div> : null}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        disabled={!canModerate || hide.isPending}
                        title={why("moderation.resolve")}
                        onClick={() => (i.hidden_by_admin ? hide.mutate({ item: i, hidden: false }) : (setError(""), setTarget(i)))}
                      >
                        {i.hidden_by_admin ? "Show again" : "Hide"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Query>
      {target ? (
        <ConfirmDialog
          title={`Hide “${target.name}”?`}
          summary="Customers will not see this item. The seller is told and can see your reason."
          confirmLabel="Hide item"
          danger
          busy={hide.isPending}
          error={error}
          onCancel={() => setTarget(null)}
          onConfirm={(reason) => hide.mutate({ item: target, hidden: true, reason })}
        />
      ) : null}
      {!target && error ? <p role="alert" className="biz-error">{error}</p> : null}
    </>
  );
}

// ---- Flags and reports -------------------------------------------------------------------------------------------
export function FlagsTab({ id }) {
  const { can, why } = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["admin-business-flags", id], queryFn: () => api.getBusinessFlags(id), retry: false });
  const [error, setError] = useState("");
  const set = useMutation({
    mutationFn: ({ flag, status }) => api.setFlagStatus({ id: flag.id, status }),
    onSuccess: (_r, { status }) => {
      setError("");
      toast.push({ message: status === "resolved" ? "Flag resolved." : "Flag reopened." });
      client.invalidateQueries({ queryKey: ["admin-business-flags", id] });
      client.invalidateQueries({ queryKey: ["admin-business", id] });
      client.invalidateQueries({ queryKey: ["admin-business-activity", id] });
    },
    onError: (e) => setError(friendlyError(e)),
  });
  const canResolve = can("moderation.resolve");
  return (
    <Query query={query} empty="">
      {(data) => (
        <div className="biz-flags">
          <h3 className="heading-flow">Flags raised by EpicMKT</h3>
          {data.flags.length === 0 ? <p className="muted">No flags.</p> : (
            <ul className="biz-list">
              {data.flags.map((f) => (
                <li key={f.id}>
                  <div>
                    <strong>{f.reason}</strong> <span className={`chip ${f.status === "resolved" ? "chip--neutral" : "chip--danger"}`}>{label({}, f.status)}</span>
                    <div className="muted">{f.item_name ? `On “${f.item_name}” · ` : ""}raised {timeAgo(f.created_at)}{f.due_at ? ` · seller due ${formatDate(f.due_at)}` : ""}</div>
                    {f.seller_reply ? <div className="biz-quote">Seller replied: {f.seller_reply}</div> : null}
                  </div>
                  <Button size="sm" disabled={!canResolve || set.isPending} title={why("moderation.resolve")} onClick={() => set.mutate({ flag: f, status: f.status === "resolved" ? "open" : "resolved" })}>
                    {f.status === "resolved" ? "Reopen" : "Resolve"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="heading-flow">Reports from customers</h3>
          {data.reports.length === 0 ? <p className="muted">No reports.</p> : (
            <ul className="biz-list">
              {data.reports.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>{label({}, r.reason)}</strong> <span className="chip chip--neutral">{label({}, r.status)}</span>
                    <div className="muted">{r.item_name ? `On “${r.item_name}” · ` : ""}{timeAgo(r.created_at)}</div>
                    {r.details ? <div className="biz-quote">{r.details}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error ? <p role="alert" className="biz-error">{error}</p> : null}
        </div>
      )}
    </Query>
  );
}

// ---- Activity ----------------------------------------------------------------------------------------------------
export function ActivityTab({ id }) {
  const query = useQuery({ queryKey: ["admin-business-activity", id], queryFn: () => api.getBusinessActivity(id), retry: false });
  return (
    <Query query={query} empty="Nothing has been done on this business yet.">
      {(rows) => (
        <ul className="biz-list">
          {rows.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{auditLabel(a.action)}</strong>
                <div className="muted">{a.actor_email ?? "System"} · {timeAgo(a.created_at)}</div>
                {a.reason ? <div className="biz-quote">{a.reason}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Query>
  );
}

// ---- Notes -------------------------------------------------------------------------------------------------------
export function NotesTab({ id }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["admin-business-notes", id], queryFn: () => api.getBusinessNotes(id), retry: false });
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["admin-business-notes", id] });
  const fail = (e) => setError(friendlyError(e));
  const add = useMutation({
    mutationFn: () => api.addBusinessNote({ id, body, pinned }),
    onSuccess: () => { setBody(""); setPinned(false); setError(""); refresh(); },
    onError: fail,
  });
  const pin = useMutation({ mutationFn: (n) => api.setBusinessNotePinned({ noteId: n.id, pinned: !n.pinned }), onSuccess: () => { setError(""); refresh(); }, onError: fail });
  const del = useMutation({ mutationFn: (n) => api.deleteBusinessNote(n.id), onSuccess: () => { setAsking(null); setError(""); refresh(); }, onError: (e) => { setAsking(null); fail(e); } });
  return (
    <div className="biz-notes">
      <form
        className="biz-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim() && !add.isPending) add.mutate();
        }}
      >
        <label className="field">
          Add a note (only admins see notes)
          <textarea value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="biz-check"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Pin to the top</label>
        <Button type="submit" variant="primary" disabled={!body.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add note"}</Button>
      </form>
      {error ? <p role="alert" className="biz-error">{error}</p> : null}
      <Query query={query} empty="No notes yet.">
        {(rows) => (
          <ul className="biz-list">
            {rows.map((n) => (
              <li key={n.id}>
                <div>
                  {n.pinned ? <span className="chip chip--tint">Pinned</span> : null}
                  <p className="biz-note-body">{n.body}</p>
                  <div className="muted">{n.author_email ?? "An admin"} · {timeAgo(n.created_at)}</div>
                </div>
                <span className="biz-row-actions">
                  <Button size="sm" disabled={pin.isPending} onClick={() => pin.mutate(n)}>{n.pinned ? "Unpin" : "Pin"}</Button>
                  {asking === n.id ? (
                    <>
                      <Button size="sm" className="admin-button--danger" disabled={del.isPending} onClick={() => del.mutate(n)}>Delete note</Button>
                      <Button size="sm" onClick={() => setAsking(null)}>Keep</Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setAsking(n.id)}>Delete note</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Query>
    </div>
  );
}
