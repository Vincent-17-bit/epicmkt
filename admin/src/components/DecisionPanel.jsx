import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import {
  ACTIONS,
  MESSAGE_CHANNELS,
  REJECT_REASONS,
  UNDO_MS,
  buildRequest,
  canDo,
  channelAvailable,
  defaultChannels,
  describeError,
  smsSegments,
  validateDecision,
} from "../lib/decisions.js";

const TABS = ["approve", "request_changes", "reject", "set_verification", "return_to_queue"];

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const money = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;

function MessagePreview({ app, draft, valid, errors }) {
  const debounced = useDebounced(draft, 300);
  const wantsMessage = debounced.channels.sms || debounced.channels.email;
  const check = validateDecision(app, debounced);
  const request = buildRequest(app, debounced, { preview: true });

  const { data, isFetching, error } = useQuery({
    queryKey: ["decision-preview", request],
    queryFn: () => api.decideApplication(request),
    enabled: check.ok && wantsMessage,
    retry: false,
    staleTime: 30_000,
  });

  if (!wantsMessage) {
    return <p className="dp-hint">No message will be sent. The applicant sees the new status on their status page.</p>;
  }
  if (!valid) {
    const first = errors.reason ?? errors.note ?? errors.priceOverride ?? errors.verificationLevel;
    return <p className="dp-hint">{first ? `${first} Then the message preview shows here.` : "Preview appears once the form is complete."}</p>;
  }
  if (error) return <p className="dp-error" role="alert">{describeError(error)}</p>;
  if (!data) return <p className="dp-hint">{isFetching ? "Rendering the message…" : "Preview appears once the form is complete."}</p>;

  return (
    <div className="dp-previews" aria-live="polite">
      {MESSAGE_CHANNELS.filter((c) => data.messages?.[c.id]).map((c) => {
        const m = data.messages[c.id];
        return (
          <figure key={c.id} className="dp-preview">
            <figcaption>
              <strong>{c.label}</strong>
              <span>to {m.to ?? "no address on file"}</span>
            </figcaption>
            {m.subject ? <div className="dp-preview__subject">{m.subject}</div> : null}
            <p>{m.body}</p>
            {c.id === "sms" ? <small>{m.body.length} characters, {smsSegments(m.body)} SMS</small> : null}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * Decision panel for one application. It never sends anything itself: it hands a finished
 * request to onDecide, and the page holds it for the undo window.
 */
export default function DecisionPanel({ app, onDecide, intent }) {
  const allowed = TABS.filter((t) => canDo(t, app.status));
  const [action, setAction] = useState(allowed[0] ?? "approve");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [channels, setChannels] = useState(() => defaultChannels(app));
  const [override, setOverride] = useState(false);
  const [priceOverride, setPriceOverride] = useState("");
  const [verificationLevel, setVerificationLevel] = useState("verified");
  const [alsoVerify, setAlsoVerify] = useState(false);
  const [stage, setStage] = useState("edit");
  const [touched, setTouched] = useState(false);
  const reasonRef = useRef(null);
  const noteRef = useRef(null);
  const panelRef = useRef(null);

  const draft = useMemo(() => ({
    action,
    reason,
    note,
    channels,
    priceOverride: override ? priceOverride : undefined,
    verificationLevel: action === "set_verification" ? verificationLevel : alsoVerify ? "verified" : undefined,
  }), [action, reason, note, channels, override, priceOverride, verificationLevel, alsoVerify]);

  const { ok, errors } = validateDecision(app, draft);

  // Keyboard shortcuts from focus mode choose the action and put the cursor where it is needed.
  // An intent from before this panel mounted (the previous application) must not replay.
  const seenIntent = useRef(intent?.n);
  useEffect(() => {
    if (!intent || intent.n === seenIntent.current || !canDo(intent.action, app.status)) return undefined;
    seenIntent.current = intent.n;
    setAction(intent.action);
    setStage("edit");
    setTouched(false);
    const t = setTimeout(() => {
      if (intent.action === "reject") reasonRef.current?.focus();
      else if (intent.action === "request_changes") noteRef.current?.focus();
      else panelRef.current?.querySelector("[data-primary]")?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [intent, app.status]);

  const selectAction = (next) => {
    setAction(next);
    setStage("edit");
    setTouched(false);
  };

  const needsConfirm = action === "approve" || action === "reject";
  const sendTo = MESSAGE_CHANNELS.filter((c) => channels[c.id]).map((c) => c.label);

  const submit = () => {
    setTouched(true);
    if (!ok) return;
    if (needsConfirm && stage === "edit") {
      setStage("confirm");
      return;
    }
    onDecide({
      app,
      action,
      request: buildRequest(app, draft),
      previousVerification: app.verificationLevel,
      label: `${ACTIONS[action].label}: ${app.businessName}`,
      channelsQueued: MESSAGE_CHANNELS.filter((c) => channels[c.id] && channelAvailable(app, c.id)).map((c) => c.label),
    });
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const primaryLabel = () => {
    if (stage === "confirm") return `Confirm ${ACTIONS[action].label.toLowerCase()}`;
    if (action === "approve") return "Approve…";
    if (action === "reject") return "Reject…";
    return ACTIONS[action].verb;
  };

  const noteLabel = action === "request_changes" ? "What needs changing?" : "Message to the applicant (optional)";
  const showReason = action === "reject" || (action === "approve" && override);
  const reasonLabel = action === "reject" ? "Reason (the applicant sees this)" : "Why is the price being overridden?";
  const showErrors = touched;

  if (allowed.length === 0) {
    return (
      <section className="dp" aria-label="Decision">
        <p className="dp-hint">This application is {app.status.replace("_", " ")}. No decision is open on it.</p>
      </section>
    );
  }

  return (
    <section className="dp" aria-label={`Decision for ${app.businessName}`} ref={panelRef} onKeyDown={onKeyDown}>
      <div className="dp__tabs" role="group" aria-label="Decision">
        {allowed.map((t) => (
          <button
            key={t}
            type="button"
            className={`dp-tab dp-tab--${ACTIONS[t].tone}`}
            aria-pressed={action === t}
            onClick={() => selectAction(t)}
          >
            {ACTIONS[t].label}
            {ACTIONS[t].key ? <kbd>{ACTIONS[t].key}</kbd> : null}
          </button>
        ))}
      </div>

      {stage === "confirm" ? (
        <div className={`dp-confirm dp-confirm--${ACTIONS[action].tone}`} role="alertdialog" aria-label="Confirm decision">
          <strong>
            {action === "approve" ? "Approve" : "Reject"} {app.businessName}?
          </strong>
          <p>
            {action === "approve"
              ? `Payment instructions for ${money(override && priceOverride !== "" ? priceOverride : app.price)} go out${sendTo.length ? ` by ${sendTo.join(" and ")}` : ""}.`
              : `The applicant is told it wasn't approved: “${reason.trim()}”.`}
            {" "}You have {UNDO_MS / 1000} seconds to undo before anything is sent.
          </p>
          <div className="dp-confirm__actions">
            <button type="button" className="secondary-button" onClick={() => setStage("edit")}>Back</button>
            <button type="button" className="primary-button" data-primary onClick={submit}>{primaryLabel()}</button>
          </div>
        </div>
      ) : (
        <>
          {action === "approve" ? (
            <fieldset className="dp-group">
              <legend>Price</legend>
              <p className="dp-line">List price <strong>{money(app.price)}</strong> for the {app.planName ?? "selected"} plan.</p>
              <label className="dp-check">
                <input type="checkbox" checked={override} onChange={(e) => { setOverride(e.target.checked); if (!e.target.checked) setPriceOverride(""); }} />
                Override the price
              </label>
              {override ? (
                <label className="dp-field">
                  <span>New price (KES)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    aria-invalid={showErrors && Boolean(errors.priceOverride)}
                  />
                  {showErrors && errors.priceOverride ? <em role="alert">{errors.priceOverride}</em> : null}
                </label>
              ) : null}
              <label className="dp-check">
                <input type="checkbox" checked={alsoVerify} onChange={(e) => setAlsoVerify(e.target.checked)} />
                Also mark as verified
              </label>
            </fieldset>
          ) : null}

          {action === "set_verification" ? (
            <fieldset className="dp-group">
              <legend>Verification level</legend>
              <p className="dp-line">Currently <strong>{app.verificationLevel}</strong>.</p>
              <div className="dp-radios">
                {["verified", "unverified"].map((level) => (
                  <label key={level} className="dp-check">
                    <input type="radio" name="verification" value={level} checked={verificationLevel === level} onChange={() => setVerificationLevel(level)} />
                    {level === "verified" ? "Verified" : "Unverified"}
                  </label>
                ))}
              </div>
              {showErrors && errors.verificationLevel ? <em role="alert">{errors.verificationLevel}</em> : null}
            </fieldset>
          ) : null}

          {action === "request_changes" && (app.flags ?? []).length > 0 ? (
            <p className="dp-line">
              {(app.flags ?? []).filter((f) => f.status === "open").length} open flag(s) on this application go with the request.
            </p>
          ) : null}

          {showReason ? (
            <label className="dp-field">
              <span>{reasonLabel}</span>
              <textarea
                ref={reasonRef}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={showErrors && Boolean(errors.reason)}
              />
              {action === "reject" ? (
                <span className="dp-chips">
                  {REJECT_REASONS.map((text) => (
                    <button key={text} type="button" className="dp-chip" onClick={() => setReason(text)}>{text}</button>
                  ))}
                </span>
              ) : null}
              {showErrors && errors.reason ? <em role="alert">{errors.reason}</em> : null}
            </label>
          ) : null}

          {(
            <label className="dp-field">
              <span>{noteLabel}</span>
              <textarea
                ref={noteRef}
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={showErrors && Boolean(errors.note)}
              />
              {showErrors && errors.note ? <em role="alert">{errors.note}</em> : null}
            </label>
          )}

          <fieldset className="dp-group">
            <legend>Send to the applicant</legend>
            <div className="dp-channels">
              {MESSAGE_CHANNELS.map((c) => {
                const available = channelAvailable(app, c.id);
                return (
                  <label key={c.id} className={`dp-check ${available ? "" : "is-disabled"}`} title={available ? undefined : c.missing}>
                    <input
                      type="checkbox"
                      checked={Boolean(channels[c.id]) && available}
                      disabled={!available}
                      onChange={(e) => setChannels((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                    {c.label}
                    {!available ? <small>{c.missing}</small> : null}
                  </label>
                );
              })}
            </div>
            {showErrors && errors.channels ? <em role="alert">{errors.channels}</em> : null}
          </fieldset>

          <MessagePreview app={app} draft={draft} valid={ok} errors={errors} />

          {showErrors && errors.action ? <p className="dp-error" role="alert">{errors.action}</p> : null}

          <div className="dp__footer">
            <span className="dp-hint">Ctrl or ⌘ + Enter to continue</span>
            <button type="button" className={`primary-button dp-submit dp-submit--${ACTIONS[action].tone}`} data-primary onClick={submit}>
              {primaryLabel()}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
