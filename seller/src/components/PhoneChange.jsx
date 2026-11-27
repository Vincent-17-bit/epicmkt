import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneInput } from "@epicmkt/ui";
import { maskPhone } from "@epicmkt/shared";
import { countryName, flagOf, isValidPhone, parsePhone } from "@epicmkt/shared/phone";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY } from "../lib/useBusinessFacts.js";
import { useCountdown, waitText } from "../lib/useCountdown.js";
import Notice from "./Notice.jsx";
import ui from "../styles/ui.module.css";
import styles from "./phoneChange.module.css";

// Changing the phone number on the listing, from anywhere in the world. The number is the one customers call and the one that gets
// sign-in and password codes, so it is changed only by someone who has both the current password and the new phone in hand:
//   1. the new number (country picker + number) and the current password -> a code is texted to the NEW number
//   2. the code -> saved
// `startOpen` goes straight to the form, for a dialog the seller already opened to change the number.
// `onAskAdmin` (optional) adds a way out for a seller who cannot do this, such as one who has lost their password.

const STEPS = ["New number", "Enter code"];

function Steps({ current }) {
  return (
    <ol className={styles.cnSteps} aria-label="Progress">
      {STEPS.map((title, i) => (
        <li key={title} aria-current={current === i + 1 ? "step" : undefined} data-done={current > i + 1 ? "true" : undefined}>
          <span className={styles.cnDot} aria-hidden="true">{current > i + 1 ? "\u2713" : i + 1}</span>
          <span>Step {i + 1} of {STEPS.length}: {title}</span>
        </li>
      ))}
    </ol>
  );
}

// What to tell the seller, in plain words, and how long to wait when the server asks for a pause.
function explain(err) {
  const code = err?.code;
  if (code === "rate_limited") {
    const secs = Number(err.retryAfter) || 60;
    return secs >= 600
      ? { text: `You have asked for too many codes. Please try again in about ${waitText(secs)}.`, more: "If you cannot wait, ask an admin to change your number.", wait: secs }
      : { text: `Please wait ${waitText(secs)} before asking for another code.`, more: "We limit this to keep your account safe.", wait: secs };
  }
  if (code === "send_failed") {
    return {
      text: "We could not text that number, and no code was used up.",
      more: "Check that it is a mobile number that can receive text messages, then try again. If it keeps failing, ask an admin to change it instead.",
      failed: true,
    };
  }
  if (code === "invalid_code") return { text: "That code is not valid or has expired.", more: "Check the latest text you received, or ask for a new code." };
  return { text: errorText(err, "Something went wrong. Please try again.") };
}

export default function PhoneChange({ currentPhone, currentWhatsapp, onAskAdmin, onChanged, startOpen = false }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(startOpen ? "phone" : "idle"); // idle | phone | code
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState(null); // { text, more, failed }
  const [info, setInfo] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const wait = useCountdown();
  // WhatsApp follows the new number by default when it is the same number as the call number today (or not set), so the two do not drift apart;
  // a seller who keeps a different WhatsApp number is not touched unless they tick it.
  const sameToday = !currentWhatsapp || currentWhatsapp === currentPhone;
  const [alsoWhatsapp, setAlsoWhatsapp] = useState(sameToday);
  const [whatsappMoved, setWhatsappMoved] = useState(false);

  const reset = () => { setStep(startOpen ? "phone" : "idle"); setPhone(""); setCurrentPassword(""); setShowPassword(false); setCode(""); setError(null); setInfo(""); };
  const fail = (err) => {
    const e = explain(err);
    setError(e);
    if (e.wait) wait.start(e.wait);
  };

  const requestCode = async () => {
    const r = await api.requestOtp({ purpose: "verify_phone", phone, currentPassword });
    setSentTo(r?.sentTo ?? maskPhone(phone));
    wait.start(60); // the server makes us wait a minute before another code
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setError(null);
    if (!phone || !isValidPhone(phone)) return setError({ text: "Enter a valid phone number.", more: "Choose the country, then type the number." });
    if (currentPhone && parsePhone(phone)?.e164 === currentPhone) return setError({ text: "That is already your number." });
    if (!currentPassword) return setError({ text: "Enter your current password." });
    setBusy(true);
    try {
      await requestCode();
      setInfo("");
      setStep("code");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo("");
    setBusy(true);
    try {
      await requestCode();
      setCode("");
      setInfo("A new code is on its way.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (!code.trim()) return setError({ text: "Enter the code from the text message." });
    setBusy(true);
    try {
      const saved = await api.setLoginPhone({ code: code.trim(), currentPassword, alsoWhatsapp });
      setWhatsappMoved(saved?.whatsappChanged === true);
      await Promise.all([qc.invalidateQueries({ queryKey: ["subscription"] }), qc.invalidateQueries({ queryKey: FACTS_KEY })]);
      reset();
      setDone(true);
      onChanged?.();
    } catch (err) {
      if (err?.code === "invalid_password") setStep("phone");
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const countryOfNew = phone ? countryName(parsePhone(phone)?.country ?? "") : "";
  const current = currentPhone ? parsePhone(currentPhone) : null;
  const showCount = wait.left > 0 && wait.left <= 120;

  const errorBox = error && (
    <Notice tone="error">
      <p><strong>{error.text}</strong></p>
      {error.more && <p>{error.more}</p>}
    </Notice>
  );

  return (
    <>
      {done && (
        <Notice tone="ok" className={styles.cnSaved}>
          <p>{whatsappMoved ? "Phone number and WhatsApp number saved." : "Phone number saved."} We also sent a notice to your old number.</p>
        </Notice>
      )}

      {step === "idle" && (
        <div className={styles.cnIdleHost}><div className={styles.cnIdle}>
          <div className={styles.cnIdentity}>
            <span className={styles.cnLabel}>Call number</span>
            <strong className={styles.cnValue} aria-label="Phone number, masked">
              {current?.country && <span className={styles.cnFlag} aria-hidden="true">{flagOf(current.country)}</span>}
              {currentPhone ? maskPhone(currentPhone) : "not set"}
            </strong>
            {current?.country && <p className={styles.cnMeta}>{countryName(current.country)}</p>}
            <ul className={styles.cnUses} aria-label="Used for">
              <li>Call button on your shop page</li>
              <li>Sign-in and password codes</li>
            </ul>
          </div>
          <div className={styles.cnIdleActions}>
            <button type="button" className={ui.btn} onClick={() => { setDone(false); setAlsoWhatsapp(sameToday); setStep("phone"); }}>Change phone number</button>
          </div>
        </div></div>
      )}

      {step === "phone" && (
        <div className={`${styles.cnPanel} ${startOpen ? styles.cnPanelOnly : ""}`}>
          <Steps current={1} />
          <form className={styles.cnForm} onSubmit={sendCode} noValidate>
            <p className={styles.cnIntro}>We will text a <strong>6-digit code</strong> to the new number to check it is yours. Your Seller ID will keep working.</p>
            <div className={styles.cnGrid}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="pc-phone">New phone number</label>
                <PhoneInput id="pc-phone" value={phone} onChange={setPhone} inputClassName={ui.input} />
                <p className={styles.cnHint}>Pick the country first, then type the number the way you would dial it there.</p>
              </div>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="pc-pw">Current password</label>
                <div className={styles.cnSecret}>
                  <input id="pc-pw" type={showPassword ? "text" : "password"} className={ui.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" className={styles.cnReveal} onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
                </div>
                <p className={styles.cnHint}>To make sure it is really you.</p>
              </div>
              <label className={`${styles.cnOption} ${styles.cnSpan}`}>
                <input type="checkbox" checked={alsoWhatsapp} onChange={(e) => setAlsoWhatsapp(e.target.checked)} />
                <span className={styles.cnOptionText}>
                  <strong>Use this number for WhatsApp too</strong>
                  {sameToday ? (
                    <span>Customers who tap WhatsApp on your shop page will reach the new number.</span>
                  ) : (
                    <span>Leave this unticked to keep your WhatsApp as it is (your WhatsApp is now <span className={styles.cnNumber}>{maskPhone(currentWhatsapp)}</span>).</span>
                  )}
                </span>
              </label>
            </div>
            {errorBox}
            <div className={styles.cnActions}>
              <button type="submit" className={ui.btn} disabled={busy || wait.left > 0} aria-label={`Send code to this number${wait.left > 0 ? `, available again in ${waitText(wait.left)}` : ""}`}>
                {busy ? "Sending" : "Send code"}
                {showCount && !busy ? <span> ({wait.left}s)</span> : null}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={reset}>Cancel</button>
            </div>
            {onAskAdmin && <button type="button" className={styles.cnLink} onClick={onAskAdmin}>Cannot do this? Ask an admin to change it</button>}
          </form>
        </div>
      )}

      {step === "code" && (
        <div className={`${styles.cnPanel} ${startOpen ? styles.cnPanelOnly : ""}`}>
          <Steps current={2} />
          <form className={styles.cnForm} onSubmit={save} noValidate>
            <p className={styles.cnIntro}>Code sent by SMS to <strong className={styles.cnNumber}>{sentTo}</strong>{countryOfNew ? ` (${countryOfNew})` : ""}. It can take a minute to arrive.</p>
            <div className={`${ui.field} ${styles.cnCodeField}`}>
              <label className={ui.label} htmlFor="pc-code">Code from the text message</label>
              <input id="pc-code" className={`${ui.input} ${styles.cnCodeBox}`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="······" autoFocus />
            </div>
            {info && <Notice tone="info"><p>{info}</p></Notice>}
            {errorBox}
            <div className={styles.cnActions}>
              <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save phone number"}</button>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setStep("phone"); setCode(""); setError(null); setInfo(""); }}>Use a different number</button>
            </div>
            <button type="button" className={styles.cnLink} disabled={busy || wait.left > 0} onClick={resend}>
              {wait.left > 0 ? `Send a new code in ${waitText(wait.left)}` : "Send a new code"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
