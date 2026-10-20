import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../../components/Button.jsx";
import { useToast } from "../../components/Toast.jsx";
import { COUNTS_KEY } from "../../hooks/useAdminCounts.js";
import {
  ACTION_LABELS, availableActions, canReview, describeError, eventLabel, flagPathLabel, formatBytes, formatKes, maskValue,
  slotLabel, statusMeta,
} from "../../lib/applications.js";
import { formatDate, formatDateTime, timeAgo } from "../../lib/time.js";
import ApplicationStatus from "./ApplicationStatus.jsx";
import DecisionDialog from "./DecisionDialog.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import "./applications.css";

const ACTOR = { seller: "Applicant", admin: "Reviewer", system: "System" };

function Field({ label, children }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="detail__field">
      <dt>{label}</dt>
      <dd>{empty ? <span className="muted">Not given</span> : children}</dd>
    </div>
  );
}

const showValue = (value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export default function ApplicationDetailPage() {
  const { can, why } = usePermissions();
  const { id } = useParams();
  const { admin } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const allowed = canReview(admin?.role);

  const [action, setAction] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [openingDoc, setOpeningDoc] = useState(null);

  const detail = useQuery({
    queryKey: ["admin-application", id],
    queryFn: () => api.getApplication(id),
    enabled: allowed,
    retry: (count, error) => error?.code !== "not_found" && error?.code !== "forbidden" && count < 1,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-application", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
    queryClient.invalidateQueries({ queryKey: COUNTS_KEY });
  };

  // Opening a submitted application starts its review: it moves to "under review" and is assigned to whoever
  // opened it (admin_open_application, which also writes the audit entry). "Return to queue" undoes it.
  const opened = useRef(null);
  const status = detail.data?.application.status;
  useEffect(() => {
    if (!allowed || status !== "submitted" || opened.current === id) return;
    opened.current = id;
    api.openApplication(id).then(refreshAll).catch(() => {
      // Someone else may have opened it a moment ago. The page refreshes to show the real state.
      refreshAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, status, id]);

  if (!allowed) {
    return (
      <div className="page-shell">
        <section className="panel">
          <p className="muted">Only owners and reviewers can open applications. Your role is {admin?.role ?? "unknown"}.</p>
          <Link to="/admin">Back to the Command Center</Link>
        </section>
      </div>
    );
  }

  if (detail.isPending) {
    return (
      <div className="page-shell" aria-busy="true">
        <section className="panel">
          <span className="skeleton" /><br /><br /><span className="skeleton" /><br /><br /><span className="skeleton" />
        </section>
      </div>
    );
  }

  if (detail.isError) {
    const gone = detail.error?.code === "not_found";
    return (
      <div className="page-shell">
        <section className="panel">
          <div className={gone ? "" : "banner banner--error"} role={gone ? undefined : "alert"}>
            <span>{gone ? "This application no longer exists." : `Could not load this application. ${describeError(detail.error)}`}</span>
            {gone ? null : <Button size="sm" onClick={() => detail.refetch()} disabled={detail.isFetching}>Try again</Button>}
          </div>
          <p><Link to="/admin/applications">Back to the queue</Link></p>
        </section>
      </div>
    );
  }

  const { application: app, documents, flags, events } = detail.data;
  const openFlags = flags.filter((flag) => flag.status === "open").length;
  const actions = availableActions(app.status);
  const mine = app.reviewerId && app.reviewerId === admin?.userId;
  const reviewer = app.reviewerId ? (mine ? "You" : "Another reviewer") : "Nobody yet";
  const override = app.planSnapshot?.priceOverride;
  const templateEntries = Object.entries(app.templateValues ?? {});

  const openDocument = async (doc, replacement) => {
    const tab = window.open("", "_blank"); // opened straight from the click so pop-up blockers allow it
    setOpeningDoc(`${doc.id}:${replacement}`);
    try {
      const { url } = await api.getApplicationDocumentUrl({
        applicationId: app.id,
        slotKey: doc.slotKey,
        path: replacement ? doc.replacementPath : doc.path,
      });
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        toast.push({ tone: "error", message: "Your browser blocked the new tab. Allow pop-ups for this site, then try again." });
      }
      queryClient.invalidateQueries({ queryKey: ["admin-application", id] }); // the view is now in the timeline
    } catch (error) {
      tab?.close();
      toast.push({ tone: "error", message: `Could not open the document. ${describeError(error)}` });
    } finally {
      setOpeningDoc(null);
    }
  };

  const done = (result) => {
    const label = ACTION_LABELS[result.action] ?? "Done";
    const sent = result.queued?.length ? ` Message queued by ${result.queued.join(" and ")}.` : "";
    toast.push({ message: `${label}: ${statusMeta(result.status ?? app.status).label}.${sent}` });
    setAction(null);
    refreshAll();
  };

  return (
    <div className="page-shell">
      <p className="detail__back"><Link to="/admin/applications">← Back to the queue</Link></p>

      <section className="panel detail__head">
        <div>
          <p className="eyebrow">{app.reference}</p>
          <h2 className="detail__title">{app.businessName}</h2>
          <p className="muted">
            {app.ownerName} · submitted {timeAgo(app.submittedAt)} ({formatDateTime(app.submittedAt)}) · reviewer: {reviewer}
          </p>
        </div>
        <div className="detail__chips">
          <ApplicationStatus status={app.status} />
          <span className={`chip ${app.verificationLevel === "verified" ? "chip--live" : "chip--neutral"}`}>
            {app.verificationLevel === "verified" ? "Verified" : "Unverified"}
          </span>
        </div>
      </section>

      {actions.length > 0 ? (
        <div className="detail__actions" role="group" aria-label="Decisions">
          {actions.map((name) => (
            <Button
              key={name}
              variant={name === "approve" ? "primary" : "secondary"}
              className={name === "reject" ? "admin-button--danger" : ""}
              disabled={!can("applications.decide")}
              title={why("applications.decide")}
              onClick={() => setAction(name)}
            >
              {ACTION_LABELS[name]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="muted">No decision is possible while the application is {statusMeta(app.status).label.toLowerCase()}.</p>
      )}

      {app.adminNote || app.rejectionReason ? (
        <section className="panel">
          <div className="panel__header"><h3>{app.rejectionReason ? "Rejection reason" : "Note to the applicant"}</h3></div>
          <p>{app.rejectionReason || app.adminNote}</p>
        </section>
      ) : null}

      <div className="two-column">
        <section className="panel">
          <div className="panel__header"><h3>Business</h3></div>
          <dl className="detail__grid">
            <Field label="Name">{app.businessName}</Field>
            <Field label="Category">{app.categoryName ?? app.categoryId}</Field>
            <Field label="Plan">{app.plan === "premium" ? "Premium" : "Standard"}, {formatKes(app.price)} a month</Field>
            {override ? <Field label="Price override">{formatKes(override.amount)}: {override.reason}</Field> : null}
            <Field label="Established">{app.yearEstablished}</Field>
            <Field label="Registered">{app.registered ? `Yes${app.regType ? `, ${app.regType.replace(/_/g, " ")}` : ""}` : "No"}</Field>
            <Field label="Registration number">{app.regNumber}</Field>
            <Field label="KRA PIN">{app.kraPin ? (revealed ? app.kraPin : maskValue(app.kraPin)) : null}</Field>
            <Field label="Permit number">{app.sbpNumber}</Field>
            <Field label="Permit expires">{formatDate(app.sbpExpiry)}</Field>
            <Field label="Description">{app.shortDescription}</Field>
          </dl>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h3>Owner and contact</h3>
            <Button size="sm" aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>
              {revealed ? "Hide ID numbers" : "Show ID numbers"}
            </Button>
          </div>
          <dl className="detail__grid">
            <Field label="Owner">{app.ownerName}</Field>
            <Field label={app.ownerIdType === "passport" ? "Passport number" : "National ID number"}>
              {revealed ? app.ownerIdNumber : maskValue(app.ownerIdNumber)}
            </Field>
            <Field label="Phone">{app.phone}</Field>
            <Field label="Alternative phone">{app.altPhone}</Field>
            <Field label="Email">{app.email}</Field>
            <Field label="WhatsApp">{app.whatsapp}</Field>
            <Field label="Business phones">{app.businessPhones.join(", ")}</Field>
            <Field label="Website">{app.website}</Field>
            <Field label="Location">{[app.address, app.town, app.county].filter(Boolean).join(", ")}</Field>
          </dl>
        </section>
      </div>

      {templateEntries.length > 0 ? (
        <section className="panel">
          <div className="panel__header"><h3>Category details</h3></div>
          <dl className="detail__grid">
            {templateEntries.map(([key, value]) => (
              <Field key={key} label={flagPathLabel(`templateValues.${key}`)}>{showValue(value)}</Field>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header"><h3>Documents</h3></div>
        {documents.length === 0 ? (
          <p className="muted">No documents were uploaded.</p>
        ) : (
          <ul className="detail__list">
            {documents.map((doc) => (
              <li key={doc.id}>
                <div>
                  <strong>{slotLabel(doc.slotKey)}</strong>
                  <span className="muted"> {doc.name}{doc.size ? `, ${formatBytes(doc.size)}` : ""}</span>
                  {doc.verified ? <span className="chip chip--live detail__inline-chip">Verified</span> : null}
                  {doc.replacementPath ? <span className="chip chip--tint detail__inline-chip">Replaced by the applicant</span> : null}
                </div>
                <div className="detail__list-actions">
                  <Button size="sm" disabled={openingDoc === `${doc.id}:false`} onClick={() => openDocument(doc, false)}>
                    {doc.replacementPath ? "Original" : "View"}
                  </Button>
                  {doc.replacementPath ? (
                    <Button size="sm" disabled={openingDoc === `${doc.id}:true`} onClick={() => openDocument(doc, true)}>View replacement</Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted detail__hint">Each time a document is opened it is recorded in the timeline, and the link works for 60 seconds.</p>
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel__header"><h3>Flags</h3></div>
          {flags.length === 0 ? (
            <p className="muted">Nothing is flagged.</p>
          ) : (
            <ul className="detail__list">
              {flags.map((flag) => (
                <li key={flag.id}>
                  <div>
                    <strong>{flagPathLabel(flag.path)}</strong>
                    <div>{flag.message}</div>
                  </div>
                  <span className={`chip ${flag.status === "open" ? "chip--danger" : "chip--neutral"}`}>
                    {flag.status === "open" ? "Open" : flag.status === "fixed" ? "Fixed by applicant" : "Confirmed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel__header"><h3>Timeline</h3></div>
          <ol className="detail__timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span>{eventLabel(event)}</span>
                <span className="muted">{ACTOR[event.actor] ?? event.actor}, {formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {action ? (
        <DecisionDialog application={app} action={action} openFlags={openFlags} onClose={() => setAction(null)} onDone={done} />
      ) : null}
    </div>
  );
}
