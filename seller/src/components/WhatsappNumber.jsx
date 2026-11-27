import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneInput } from "@epicmkt/ui";
import { maskPhone } from "@epicmkt/shared";
import { countryName, flagOf, isValidPhone, parsePhone, toE164 } from "@epicmkt/shared/phone";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY } from "../lib/useBusinessFacts.js";
import Notice from "./Notice.jsx";
import ui from "../styles/ui.module.css";
import styles from "./phoneChange.module.css";

// The number the WhatsApp button on the shop page, and "Chat" and "Order" on every item, open. It can be the same as the call number or a
// different one. Unlike the call number it is not used to sign in or for password codes, so it is saved straight away, no code needed.
export default function WhatsappNumber({ whatsapp, phone }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const same = Boolean(whatsapp) && whatsapp === phone;
  const shown = whatsapp || phone;
  const parsed = shown ? parsePhone(shown) : null;

  const save = async (number, message) => {
    setError(null);
    setBusy(true);
    try {
      await api.updateProfile({ whatsapp: number });
      await Promise.all([qc.invalidateQueries({ queryKey: ["subscription"] }), qc.invalidateQueries({ queryKey: FACTS_KEY }), qc.invalidateQueries({ queryKey: ["profile"] })]);
      setEditing(false);
      setValue("");
      setSaved(message);
    } catch (err) {
      setError({ text: errorText(err, "We could not save the WhatsApp number. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!value || !isValidPhone(value)) return setError({ text: "Enter a valid WhatsApp number.", more: "Choose the country, then type the number." });
    const number = toE164(value);
    if (number === whatsapp) return setError({ text: "That is already your WhatsApp number." });
    save(number, "WhatsApp number saved.");
  };

  const errorBox = error && (
    <Notice tone="error">
      <p><strong>{error.text}</strong></p>
      {error.more && <p>{error.more}</p>}
    </Notice>
  );

  return (
    <>
      {saved && <Notice tone="ok" className={styles.cnSaved}><p>{saved}</p></Notice>}
      {!editing ? (
        <>
          <div className={styles.cnIdleHost}><div className={styles.cnIdle}>
            <div className={styles.cnIdentity}>
              <strong className={styles.cnValue} aria-label="WhatsApp number, masked">
                {parsed?.country && <span className={styles.cnFlag} aria-hidden="true">{flagOf(parsed.country)}</span>}
                {whatsapp ? maskPhone(whatsapp) : phone ? `${maskPhone(phone)} (your call number)` : "not set"}
              </strong>
              <p className={styles.cnMeta}>
                {parsed?.country ? `${countryName(parsed.country)}. ` : ""}
                {same ? "This is the same as your call number" : whatsapp ? "This is a different number from your call number" : "You have not set a WhatsApp number, so customers reach your call number"}
              </p>
              <ul className={styles.cnUses} aria-label="Used for">
                <li>WhatsApp button on your shop page</li>
                <li>Chat and Order on every item</li>
              </ul>
            </div>
            <div className={styles.cnIdleActions}>
              <button type="button" className={ui.btn} onClick={() => { setSaved(""); setError(null); setEditing(true); }}>Change WhatsApp number</button>
              {phone && !same && (
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => save(phone, "WhatsApp now uses your call number.")}>Use my call number</button>
              )}
            </div>
          </div></div>
          {errorBox}
        </>
      ) : (
        <div className={styles.cnPanel}>
          <form className={styles.cnForm} onSubmit={submit} noValidate>
            <p className={styles.cnIntro}>Customers who tap WhatsApp will chat with this number. It can be different from the one they call, and it is saved straight away.</p>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="wa-number">New WhatsApp number</label>
              <PhoneInput id="wa-number" value={value} onChange={setValue} inputClassName={ui.input} />
              <p className={styles.cnHint}>Use a number that has WhatsApp on it.</p>
            </div>
            {errorBox}
            <div className={styles.cnActions}>
              <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save WhatsApp number"}</button>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setEditing(false); setValue(""); setError(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
