import { useMemo, useState } from "react";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import Modal from "../../components/Modal.jsx";
import {
  ACTION_FIELDS, ACTION_HELP, ACTION_LABELS, buildDecisionPayload, describeError, formatKes, statusMeta, validateDecision,
} from "../../lib/applications.js";

const CHANNELS = [
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
];

// One dialog for every decision. The reviewer must preview the exact messages the function will queue before the
// button that sends them is enabled, and changing anything throws that preview away.
export default function DecisionDialog({ application, action, openFlags = 0, onClose, onDone }) {
  const fields = ACTION_FIELDS[action] ?? [];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(application.adminNote ?? "");
  const [verificationLevel, setVerificationLevel] = useState(application.verificationLevel ?? "unverified");
  const [override, setOverride] = useState(false);
  const [priceOverride, setPriceOverride] = useState("");
  const [channels, setChannels] = useState({ sms: action !== "return_to_queue", email: action !== "return_to_queue" });
  const [preview, setPreview] = useState(null); // { key, data }
  const [busy, setBusy] = useState(null); // "preview" | "send"
  const [error, setError] = useState("");

  const form = { action, reason, note, verificationLevel, priceOverride: override ? priceOverride : "" };
  const problem = validateDecision(form, { openFlags });
  const payload = useMemo(
    () => buildDecisionPayload({ applicationId: application.id, ...form, channels }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [application.id, action, reason, note, verificationLevel, override, priceOverride, channels],
  );
  const key = JSON.stringify({ ...payload, preview: false });
  const previewFresh = preview?.key === key;

  const run = async (wantPreview) => {
    setBusy(wantPreview ? "preview" : "send");
    setError("");
    try {
      const result = await api.decideApplication({ ...payload, preview: wantPreview });
      if (wantPreview) setPreview({ key, data: result });
      else onDone(result);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const messages = Object.entries(preview?.data?.messages ?? {});
  const danger = action === "reject";

  return (
    <Modal title={`${ACTION_LABELS[action]}: ${application.businessName}`} onClose={busy ? () => {} : onClose}>
      <form
        className="modal__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (previewFresh && !busy) run(false);
        }}
      >
        <p className="modal__summary">{ACTION_HELP[action]}</p>

        {fields.includes("verificationLevel") ? (
          <label className="field">
            Verification level
            <select value={verificationLevel} onChange={(event) => setVerificationLevel(event.target.value)}>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
            </select>
          </label>
        ) : null}

        {fields.includes("note") ? (
          <label className="field">
            Note to the applicant{openFlags > 0 ? ` (optional, ${openFlags} open ${openFlags === 1 ? "flag" : "flags"} already tell them what to fix)` : ""}
            <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
          </label>
        ) : null}

        {action === "reject" ? (
          <label className="field">
            Reason (the applicant will see this)
            <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </label>
        ) : null}

        {action === "approve" ? (
          <>
            <label className="field field--inline">
              <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
              Charge a different amount than {formatKes(application.price)}
            </label>
            {override ? (
              <>
                <label className="field">
                  Amount in KES
                  <input type="number" inputMode="numeric" min="0" max="100000" step="1" value={priceOverride} onChange={(event) => setPriceOverride(event.target.value)} />
                </label>
                <label className="field">
                  Reason for the change
                  <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
                </label>
              </>
            ) : null}
          </>
        ) : null}

        <fieldset className="field applications__channels">
          <legend>Tell the applicant by</legend>
          {CHANNELS.map((channel) => (
            <label key={channel.id} className="field--inline">
              <input
                type="checkbox"
                checked={channels[channel.id]}
                onChange={(event) => setChannels((current) => ({ ...current, [channel.id]: event.target.checked }))}
              />
              {channel.label}
            </label>
          ))}
        </fieldset>

        {previewFresh ? (
          <div className="applications__preview" aria-live="polite">
            <p className="muted">
              Status will change from {statusMeta(application.status).label} to {statusMeta(preview.data.nextStatus).label}.
            </p>
            {messages.length === 0 ? <p>No message will be sent.</p> : null}
            {messages.map(([channel, message]) => (
              <figure key={channel} className="applications__message">
                <figcaption>{channel === "sms" ? "SMS" : "Email"} to {message.to}{message.subject ? `, subject: ${message.subject}` : ""}</figcaption>
                <blockquote>{message.body}</blockquote>
              </figure>
            ))}
          </div>
        ) : (
          <p className="muted">Preview the message before you send it.</p>
        )}

        {problem && !error ? <p className="muted">{problem}</p> : null}
        {error ? <p className="modal__error" role="alert">{error}</p> : null}

        <div className="modal__footer">
          <Button onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>
          <Button onClick={() => run(true)} disabled={Boolean(problem) || Boolean(busy)}>
            {busy === "preview" ? "Checking" : "Preview"}
          </Button>
          <Button type="submit" variant="primary" className={danger ? "admin-button--danger" : ""} disabled={!previewFresh || Boolean(busy)}>
            {busy === "send" ? "Working" : ACTION_LABELS[action]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
