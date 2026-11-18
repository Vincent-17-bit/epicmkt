import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck, faCircleExclamation, faCircleXmark, faMobileScreenButton, faRotateRight, faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { formatPrice } from "@epicmkt/shared/billing";
import {
  localPhone, stkOutcomeText, stkPhone, stkStage, STK_FALLBACK_ERRORS, STK_POLL_MS, STK_RESEND_AFTER_MS, STK_WAIT_MS,
} from "@epicmkt/shared/mpesa";
import Button from "../components/Button.jsx";
import styles from "./PayByPhone.module.css";

const ICONS = { info: faSpinner, success: faCircleCheck, warning: faCircleExclamation, error: faCircleXmark };
const TONE = { info: "isInfo", success: "isSuccess", warning: "isWarning", error: "isError" };

function Btn({ cls, icon, spin = false, variant = "primary", size = "md", className = "", children, ...rest }) {
  if (!cls) return <Button variant={variant} size={size} icon={icon} className={className} {...rest}>{children}</Button>;
  return (
    <button type="button" className={`${cls} ${className}`} {...rest}>
      {icon && <FontAwesomeIcon icon={icon} spin={spin} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

/**
 * "Pay now" with M-Pesa: the payer confirms their number, presses Pay, and enters their PIN on the prompt that appears on the
 * phone. Nothing else is typed. The amount on the button is only a preview; the server works out the real amount and the
 * waiting state shows the amount Safaricom was asked for.
 *
 * start({ phone }) -> { request }   (throws an Error with .code, .message and maybe .request)
 * poll(requestId)  -> { request }
 * onPaid(request)  called once when the payment is recorded (refresh the page data there)
 * onFallback(code) called when paying by prompt is not possible (show the Paybill details)
 * onWaitingChange(waiting) called when a prompt starts or stops waiting for the payer (lock what the amount depends on)
 * buttonClassName / secondaryButtonClassName: an app's own button classes, so the buttons match the page around them
 * (the seller portal's square buttons); without them the shared pill Button is used.
 */
export default function PayByPhone({
  amount, defaultPhone = "", start, poll, onPaid, onFallback, disabled = false, disabledReason = "",
  title = "Pay with M-Pesa", payLabel, formatDay, now = () => Date.now(), pollMs = STK_POLL_MS,
  buttonClassName = "", secondaryButtonClassName = "", onWaitingChange,
}) {
  const id = useId();
  const [phone, setPhone] = useState(() => (stkPhone(defaultPhone) ? localPhone(defaultPhone) : ""));
  const [phoneError, setPhoneError] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [request, setRequest] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [, setTick] = useState(0);
  const paidRef = useRef(null);
  const stage = stkStage(request);

  // Ask for news while the prompt is open; stop after STK_WAIT_MS and let the payer check again.
  useEffect(() => {
    if (!request?.id || !stage.waiting || timedOut) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await poll(request.id);
        if (!cancelled && r?.request) setRequest(r.request);
      } catch (e) {
        if (!cancelled && (e?.code === "session_expired" || e?.code === "unauthorized")) setError({ code: e.code, message: e.message || "Your session has ended. Sign in again." });
      }
      if (!cancelled) {
        setTick((n) => n + 1);
        if (startedAt != null && now() - startedAt > STK_WAIT_MS) setTimedOut(true);
      }
    }, pollMs);
    return () => { cancelled = true; clearTimeout(t); };
  }, [request, stage.waiting, timedOut, poll, pollMs, startedAt, now]);

  const waiting = Boolean(request) && stage.waiting;
  useEffect(() => { onWaitingChange?.(waiting); }, [waiting, onWaitingChange]);

  useEffect(() => {
    if (request?.status === "paid" && paidRef.current !== request.id) {
      paidRef.current = request.id;
      onPaid?.(request);
    }
  }, [request, onPaid]);

  async function send() {
    const normalized = stkPhone(phone);
    if (!normalized) {
      setPhoneError("Enter a Safaricom M-Pesa number, like 0712 345 678.");
      return;
    }
    setPhoneError("");
    setError(null);
    setTimedOut(false);
    setSending(true);
    try {
      const r = await start({ phone: normalized });
      setRequest(r.request);
      setStartedAt(now());
    } catch (e) {
      if (e?.request) setRequest(e.request);
      else setRequest(null);
      setError({ code: e?.code ?? "error", message: e?.message || "We could not send the payment request. Try again." });
      if (STK_FALLBACK_ERRORS.has(e?.code)) onFallback?.(e.code);
    } finally {
      setSending(false);
    }
  }

  const reset = () => { setRequest(null); setError(null); setTimedOut(false); };
  const checkAgain = () => { setTimedOut(false); setStartedAt(now() - STK_WAIT_MS + 30_000); };
  const elapsed = startedAt == null ? 0 : now() - startedAt;
  const showForm = !request;
  const label = payLabel ?? (amount > 0 ? `Pay ${formatPrice(amount)} now` : "Pay now");

  return (
    <section className={styles.box} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className={styles.title}>
        <FontAwesomeIcon icon={faMobileScreenButton} aria-hidden="true" /> {title}
      </h3>

      {showForm && (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); send(); }} noValidate>
          <p className={styles.lead}>We send a payment request to your phone. Enter your M-Pesa PIN there to pay. Nothing else to type.</p>
          <label className={styles.field} htmlFor={`${id}-p`}>
            <span className={styles.label}>M-Pesa phone number</span>
            <input
              id={`${id}-p`}
              className={styles.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(""); }}
              aria-invalid={phoneError ? "true" : undefined}
              aria-describedby={phoneError ? `${id}-pe` : `${id}-ph`}
              disabled={sending || disabled}
            />
          </label>
          {phoneError
            ? <p id={`${id}-pe`} className={styles.fieldError} role="alert">{phoneError}</p>
            : <p id={`${id}-ph`} className={styles.hint}>The number that will pay. It can be different from your business number.</p>}
          <Btn cls={buttonClassName} type="submit" className={styles.pay} disabled={sending || disabled} icon={sending ? faSpinner : faMobileScreenButton} spin={sending}>
            {sending ? "Sending request…" : label}
          </Btn>
          {disabled && disabledReason && <p className={styles.hint}>{disabledReason}</p>}
        </form>
      )}

      {error && !request && <p className={styles.error} role="alert">{error.message}</p>}

      {request && (
        <div className={`${styles.status} ${styles[TONE[stage.tone]]}`} role="status" aria-live="polite">
          <FontAwesomeIcon icon={ICONS[stage.tone]} spin={stage.waiting} className={styles.icon} aria-hidden="true" />
          <div className={styles.statusBody}>
            <strong className={styles.statusTitle}>{stage.title}</strong>
            <p>{stage.message}</p>
            {(request.status === "pending" || request.status === "creating") && (
              <p className={styles.detail}>
                {formatPrice(request.amount)} to EpicMKT, account <b>{request.account}</b>, sent to <b>{localPhone(request.phone)}</b>.
              </p>
            )}
            {request.status === "paid" && (
              <p className={styles.detail}>
                {formatPrice(request.amount)} paid{request.receipt ? <>, M-Pesa receipt <b>{request.receipt}</b></> : null}. {stkOutcomeText(request, formatDay)}
              </p>
            )}
            {timedOut && stage.waiting && (
              <p className={styles.detail}>Still no answer. If you entered your PIN, the payment is recorded as soon as Safaricom confirms it; you do not need to pay again.</p>
            )}
            <div className={styles.actions}>
              {stage.waiting && request.status === "pending" && elapsed > STK_RESEND_AFTER_MS && (
                <Btn cls={secondaryButtonClassName} variant="secondary" size="sm" icon={faRotateRight} onClick={send} disabled={sending}>Send the prompt again</Btn>
              )}
              {timedOut && stage.waiting && <Btn cls={secondaryButtonClassName} variant="secondary" size="sm" onClick={checkAgain}>Check again</Btn>}
              {stage.waiting && <Btn cls={secondaryButtonClassName} variant="ghost" size="sm" onClick={reset}>Use a different number</Btn>}
              {stage.retry && <Btn cls={buttonClassName} size="sm" icon={faRotateRight} onClick={reset}>Try again</Btn>}
            </div>
            {error && <p className={styles.error} role="alert">{error.message}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
