import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneInput } from "@epicmkt/ui";
import { maskPhone } from "@epicmkt/shared";
import { countryName, isValidPhone, parsePhone } from "@epicmkt/shared/phone";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY } from "../lib/useBusinessFacts.js";
import ui from "../styles/ui.module.css";
import styles from "./phoneChange.module.css";

// Changing the phone number on the listing, from anywhere in the world. The number is the one customers call and the one that gets
// sign-in and password codes, so it is changed only by someone who has both the current password and the new phone in hand:
//   1. the new number (country picker + number) and the current password -> a code is texted to the NEW number
//   2. the code -> saved
// `startOpen` goes straight to the form, for a dialog the seller already opened to change the number.
// `onAskAdmin` (optional) adds a way out for a seller who cannot do this, such as one who has lost their password.
export default function PhoneChange({ currentPhone, onAskAdmin, onChanged, startOpen = false }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(startOpen ? "phone" : "idle"); // idle | phone | code
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => { setStep(startOpen ? "phone" : "idle"); setPhone(""); setCurrentPassword(""); setCode(""); setError(""); };

  const sendCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!phone || !isValidPhone(phone)) return setError("Enter a valid phone number. Choose the country, then type the number.");
    if (currentPhone && parsePhone(phone)?.e164 === currentPhone) return setError("That is already your number.");
    if (!currentPassword) return setError("Enter your current password.");
    setBusy(true);
    try {
      const r = await api.requestOtp({ purpose: "verify_phone", phone, currentPassword });
      setSentTo(r?.sentTo ?? maskPhone(phone));
      setStep("code");
    } catch (err) {
      setError(errorText(err, "We could not send the code. Check the number and try again."));
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter the code from the text message.");
    setBusy(true);
    try {
      await api.setLoginPhone({ code: code.trim(), currentPassword });
      await Promise.all([qc.invalidateQueries({ queryKey: ["subscription"] }), qc.invalidateQueries({ queryKey: FACTS_KEY })]);
      reset();
      setDone(true);
      onChanged?.();
    } catch (err) {
      if (err?.code === "invalid_password") setStep("phone");
      setError(err?.code === "invalid_code" ? "That code is not valid or has expired." : errorText(err, "We could not save your number. Check the code and try again."));
    } finally {
      setBusy(false);
    }
  };

  const country = phone ? countryName(parsePhone(phone)?.country ?? "") : "";

  return (
    <>
      {done && <p className={`${styles.ok} ${ui.muted}`} role="status">Phone number saved. We also sent a notice to your old number.</p>}
      {step === "idle" && (
        <>
          <p className={`${ui.muted} ${styles.current}`}>
            The number on your listing is <strong className={styles.number} aria-label="Phone number, masked">{currentPhone ? maskPhone(currentPhone) : "not set"}</strong>.
            Customers call it, and sign-in and password codes are texted to it. It can be from any country.
          </p>
          <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={() => { setDone(false); setStep("phone"); }}>Change phone number</button>
        </>
      )}
      {step === "phone" && (
        <form className={styles.form} onSubmit={sendCode} noValidate>
          <p className={ui.muted}>We will text a code to the new number to check it is yours. Your Seller ID will keep working.</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="pc-phone">New phone number</label>
            <PhoneInput id="pc-phone" value={phone} onChange={setPhone} inputClassName={ui.input} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="pc-pw">Current password</label>
            <input id="pc-pw" type="password" className={ui.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Sending" : "Send code to this number"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={reset}>Cancel</button>
          </div>
          {onAskAdmin && <button type="button" className={styles.link} onClick={onAskAdmin}>Cannot do this? Ask an admin to change it</button>}
        </form>
      )}
      {step === "code" && (
        <form className={styles.form} onSubmit={save} noValidate>
          <p className={ui.muted}>Code sent by SMS to <strong className={styles.number}>{sentTo}</strong>{country ? ` (${country})` : ""}. It can take a minute to arrive.</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="pc-code">Code from the text message</label>
            <input id="pc-code" className={ui.input} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save phone number"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setStep("phone"); setCode(""); setError(""); }}>Use a different number</button>
          </div>
        </form>
      )}
    </>
  );
}
