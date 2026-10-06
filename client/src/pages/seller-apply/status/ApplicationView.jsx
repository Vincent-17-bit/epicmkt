import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import Button from "../../../components/Button.jsx";
import { formatKes } from "../../../shared/billing.js";
import { docSlot, isDocPath } from "../../../shared/statusPaths.js";
import { resubmitApplication, saveCorrections } from "../../../api/applications/index.js";
import { LABELS } from "../formModel.js";
import { useCatalog } from "../useCatalog.js";
import PaymentCard from "./PaymentCard.jsx";
import Timeline from "./Timeline.jsx";
import { DocRow, Row, flagState } from "./Rows.jsx";
import { DOC_LABELS, ID_TYPE, REG_TYPE, STATUS_META } from "./statusMeta.js";
import styles from "./status.module.css";

const ERRORS = {
  session_expired: "Your session ended. Check your application again to continue.",
  flags_open: "Some items still need a correction.",
  not_editable: "This application can no longer be edited.",
  rate_limited: "Too many tries. Please wait a while and try again."
};

export default function ApplicationView({ app, session, onRefresh, onExpired, onSignOut }) {
  const catalog = useCatalog();
  const [patch, setPatch] = useState({});
  const [files, setFiles] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const meta = STATUS_META[app.status];
  const editable = app.status === "changes_requested";
  const flagFor = useMemo(() => {
    const map = new Map();
    app.flags.filter((f) => f.status !== "confirmed").forEach((f) => map.set(f.path, f));
    return map;
  }, [app.flags]);
  const open = app.flags.filter((f) => flagState(f) === "open");
  const dirty = Object.keys(patch).length > 0 || Object.keys(files).length > 0;
  const canResubmit = editable && open.length === 0 && !dirty;

  const category = catalog.category(app.category.id);
  const tplLabel = (key) => category?.template?.find((f) => f.key === key)?.label ?? key;
  const docLabel = (slot) => DOC_LABELS[slot] ?? category?.extraDocs?.find((d) => `cat_${d.key}` === slot)?.label ?? slot.replace(/^cat_/, "").replace(/_/g, " ");

  const rowProps = (path) => ({
    path,
    flag: flagFor.get(path),
    editable,
    draft: patch[path],
    error: fieldErrors[path],
    onDraft: (p, v) => {
      setPatch((cur) => ({ ...cur, [p]: v }));
      setFieldErrors((cur) => ({ ...cur, [p]: "" }));
    }
  });

  const R = (path, label, value) => <Row key={path} label={label} value={value} {...rowProps(path)} />;
  const b = app.business;
  const l = app.location;
  const c = app.contacts;

  const known = new Set([
    "owner.fullName", "owner.idNumber", "phone", "altPhone", "email", "business.name", "business.regType", "business.regNumber",
    "business.yearEstablished", "business.kraPin", "business.sbpNumber", "business.sbpExpiry", "business.shortDescription",
    "location.county", "location.town", "location.address", "location.lat", "location.lng", "contacts.businessPhones",
    "contacts.whatsapp", "contacts.website"
  ]);
  const templatePaths = Object.keys(app.templateValues ?? {}).map((k) => `templateValues.${k}`);
  const extraFlags = app.flags.filter((f) => f.status !== "confirmed" && !known.has(f.path) && !templatePaths.includes(f.path) && !isDocPath(f.path));
  const docSlots = [...new Set([...app.documents.map((d) => d.slot), ...app.flags.filter((f) => isDocPath(f.path)).map((f) => docSlot(f.path))])];

  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      await saveCorrections(session, patch, Object.entries(files).map(([slot, file]) => ({ slot, file })));
      setPatch({});
      setFiles({});
      await onRefresh();
      setMessage("Corrections saved. Resubmit for review when every item is fixed.");
    } catch (e) {
      const key = e?.details?.error ?? e?.message;
      if (key === "session_expired") return onExpired();
      if (key === "invalid" && e.details?.issues) {
        setFieldErrors(Object.fromEntries(e.details.issues.map((i) => [i.path, i.message])));
        setMessage("Please fix the highlighted fields.");
      } else if (key === "file_rejected") setMessage("A file was not accepted. Replace it with a clear PDF or photo.");
      else setMessage(ERRORS[key] ?? "We could not save your corrections. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resubmit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await resubmitApplication(session);
      await onRefresh();
    } catch (e) {
      const key = e?.details?.error ?? e?.message;
      if (key === "session_expired") return onExpired();
      setMessage(ERRORS[key] ?? "We could not resubmit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.view}>
      <section className={styles.banner} data-status={app.status} aria-labelledby="status-title">
        <FontAwesomeIcon icon={meta.icon} className={styles.bannerIcon} />
        <div>
          <p className={styles.ref}>Reference {app.referenceNo}</p>
          <h1 id="status-title">{meta.label}</h1>
          <p>{meta.text}</p>
        </div>
        <button type="button" className={styles.signOut} onClick={onSignOut}>
          <FontAwesomeIcon icon={faRightFromBracket} />
          <span>Sign out</span>
        </button>
      </section>

      <Timeline app={app} />

      {app.adminNote && (
        <section className={styles.card} aria-labelledby="note-title">
          <h2 id="note-title">Note from EpicMKT</h2>
          <p>{app.adminNote}</p>
        </section>
      )}

      {app.status === "rejected" && (
        <section className={styles.card} aria-labelledby="rej-title">
          <h2 id="rej-title">Why it was not approved</h2>
          <p>{app.rejectionReason ?? "No reason was given."}</p>
          <Button as={Link} to="/become-a-seller">
            Start a new application
          </Button>
        </section>
      )}

      {(app.status === "approved" || app.status === "payment_confirming") && (
        <PaymentCard app={app} session={session} onDone={onRefresh} onExpired={onExpired} />
      )}

      {editable && open.length > 0 && (
        <div className={styles.summary} role="alert" id="flag-summary" tabIndex={-1}>
          <h2>
            <FontAwesomeIcon icon={faCircleExclamation} /> {open.length} {open.length === 1 ? "thing needs" : "things need"} your attention
          </h2>
          <ul>
            {open.map((f) => (
              <li key={f.id}>
                <a href={`#flag-${f.id}`}>{LABELS[f.path] ?? (isDocPath(f.path) ? docLabel(docSlot(f.path)) : f.path.startsWith("templateValues.") ? tplLabel(f.path.split(".")[1]) : f.path)}: {f.message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className={styles.card} aria-labelledby="pkg-title">
        <h2 id="pkg-title">Package</h2>
        <dl className={styles.list}>
          <div className={styles.row}><dt>Business type</dt><dd><span className={styles.value}>{app.category.name}</span></dd></div>
          <div className={styles.row}><dt>Package</dt><dd><span className={styles.value}>{app.plan.name}, {formatKes(app.priceAtSubmission)} per month</span></dd></div>
        </dl>
        <p className={styles.small}>This price is fixed for your first month.</p>
      </section>

      <section className={styles.card} aria-labelledby="you-title">
        <h2 id="you-title">About you</h2>
        <dl className={styles.list}>
          {R("owner.fullName", "Full names", app.owner.fullName)}
          <div className={styles.row}><dt>ID type</dt><dd><span className={styles.value}>{ID_TYPE[app.owner.idType]}</span></dd></div>
          {R("owner.idNumber", "ID or passport number", app.owner.idNumber)}
          {R("phone", "Phone", app.phone)}
          {R("altPhone", "Alternative phone", app.altPhone)}
          {R("email", "Email", app.email)}
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="biz-title">
        <h2 id="biz-title">About the business</h2>
        <dl className={styles.list}>
          {R("business.name", "Business name", b.name)}
          <div className={styles.row}><dt>Registered</dt><dd><span className={styles.value}>{b.registered ? "Registered" : "Not registered"}</span></dd></div>
          {b.registered && R("business.regType", "Registration type", REG_TYPE[b.regType] ?? b.regType)}
          {b.registered && R("business.regNumber", "Registration number", b.regNumber)}
          {R("business.yearEstablished", "Year established", b.yearEstablished)}
          {R("business.kraPin", "KRA PIN", b.kraPin)}
          {R("business.sbpNumber", "Single Business Permit number", b.sbpNumber)}
          {R("business.sbpExpiry", "Permit expiry date", b.sbpExpiry)}
          {R("business.shortDescription", "Short description", b.shortDescription)}
          {Object.entries(app.templateValues ?? {}).map(([k, v]) => R(`templateValues.${k}`, tplLabel(k), v))}
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="loc-title">
        <h2 id="loc-title">Location and contacts</h2>
        <dl className={styles.list}>
          {R("location.county", "County", l.county)}
          {R("location.town", "Town or area", l.town)}
          {R("location.address", "Address or landmark", l.address)}
          {R("location.lat", "Map pin latitude", l.lat)}
          {R("location.lng", "Map pin longitude", l.lng)}
          {R("contacts.businessPhones", "Business phones", c.businessPhones)}
          {R("contacts.whatsapp", "WhatsApp", c.whatsapp)}
          {R("contacts.website", "Website", c.website)}
          {Object.entries(c.socials ?? {}).map(([k, v]) => (
            <div key={k} className={styles.row}><dt>{k}</dt><dd><span className={styles.value}>{v}</span></dd></div>
          ))}
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="docs-title">
        <h2 id="docs-title">Documents</h2>
        <ul className={styles.docs}>
          {docSlots.map((slot) => (
            <DocRow
              key={slot}
              slot={slot}
              label={docLabel(slot)}
              doc={app.documents.find((d) => d.slot === slot)}
              flag={flagFor.get(`documents.${slot}`)}
              editable={editable}
              pending={files[slot]}
              error={fieldErrors[`documents.${slot}`]}
              onPick={(s, file, err) => {
                setFiles((cur) => {
                  const next = { ...cur };
                  if (file) next[s] = file;
                  return next;
                });
                setFieldErrors((cur) => ({ ...cur, [`documents.${s}`]: err }));
              }}
            />
          ))}
        </ul>
      </section>

      {extraFlags.length > 0 && (
        <section className={styles.card} aria-labelledby="other-title">
          <h2 id="other-title">Other items</h2>
          <ul className={styles.docs}>
            {extraFlags.map((f) => (
              <li key={f.id} id={`flag-${f.id}`} className={styles.docRow} data-flag={flagState(f)} tabIndex={-1}>
                <strong>{f.path}</strong>
                <p className={styles.flagMessage}>{f.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}

      {editable && (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={save} disabled={!dirty || busy}>
            {busy ? "Saving" : "Save corrections"}
          </Button>
          <Button onClick={resubmit} disabled={!canResubmit || busy}>
            Resubmit for review
          </Button>
        </div>
      )}
      {editable && !canResubmit && (
        <p className={styles.small}>
          {dirty ? "Save your corrections first." : open.length > 0 ? "Fix every flagged item to resubmit." : "Nothing to resubmit yet."}
        </p>
      )}
    </div>
  );
}
