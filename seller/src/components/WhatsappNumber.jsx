import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneInput } from "@epicmkt/ui";
import { maskPhone } from "@epicmkt/shared";
import { isValidPhone, toE164 } from "@epicmkt/shared/phone";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { FACTS_KEY } from "../lib/useBusinessFacts.js";
import ui from "../styles/ui.module.css";
import styles from "./phoneChange.module.css";

// The number the WhatsApp button on the shop page, and "Chat" and "Order" on every item, open. It can be the same as the call number or a
// different one. Unlike the call number it is not used to sign in or for password codes, so it is saved straight away, no code needed.
export default function WhatsappNumber({ whatsapp, phone }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const same = Boolean(whatsapp) && whatsapp === phone;

  const save = async (number, message) => {
    setError("");
    setBusy(true);
    try {
      await api.updateProfile({ whatsapp: number });
      await Promise.all([qc.invalidateQueries({ queryKey: ["subscription"] }), qc.invalidateQueries({ queryKey: FACTS_KEY }), qc.invalidateQueries({ queryKey: ["profile"] })]);
      setEditing(false);
      setValue("");
      setSaved(message);
    } catch (err) {
      setError(errorText(err, "We could not save the WhatsApp number. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!value || !isValidPhone(value)) return setError("Enter a valid WhatsApp number. Choose the country, then type the number.");
    const number = toE164(value);
    if (number === whatsapp) return setError("That is already your WhatsApp number.");
    save(number, "WhatsApp number saved.");
  };

  return (
    <>
      {saved && <p className={`${styles.ok} ${ui.muted}`} role="status">{saved}</p>}
      {!editing ? (
        <>
          <p className={`${ui.muted} ${styles.current}`}>
            Customers who tap WhatsApp on your shop page, or Chat or Order on an item, reach{" "}
            <strong className={styles.number} aria-label="WhatsApp number, masked">{whatsapp ? maskPhone(whatsapp) : "your call number (no WhatsApp number set)"}</strong>
            {same ? ", the same as your call number" : ""}. It can be a different number from the one customers call.
          </p>
          <div className={styles.actions}>
            <button type="button" className={ui.btn} onClick={() => { setSaved(""); setEditing(true); }}>Change WhatsApp number</button>
            {phone && !same && (
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => save(phone, "WhatsApp now uses your call number.")}>Use my call number</button>
            )}
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
        </>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="wa-number">New WhatsApp number</label>
            <PhoneInput id="wa-number" value={value} onChange={setValue} inputClassName={ui.input} />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save WhatsApp number"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setEditing(false); setValue(""); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </>
  );
}
