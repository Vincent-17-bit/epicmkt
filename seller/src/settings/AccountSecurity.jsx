import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@epicmkt/ui";
import { IDLE_OPTIONS, maskPhone } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { useBusinessFacts } from "../lib/useBusinessFacts.js";
import { useSettings } from "../state/settings.js";
import { showToast } from "../state/toast.js";
import { phoneSchema, validateField } from "../lib/settingsSchema.js";
import Dialog from "../components/Dialog.jsx";
import { Row, Section, Select } from "./controls.jsx";
import styles from "./settings.module.css";

// A sign-in is an instant, so it is shown in the viewer's own time zone.
const when = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });

// The sign-in email and password already have their own verified flows on the Account page, so this section links there
// instead of repeating them. What lives here: the phone change request, the inactivity timeout, other devices and the sign-in history.
export default function AccountSecurity() {
  const facts = useBusinessFacts().data;
  const idle = useSettings((s) => s.settings.idle_minutes);
  const update = useSettings((s) => s.update);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [history, setHistory] = useState(null);

  const loadPending = useCallback(() => api.listChanges().then((rows) => setPending(rows.find((c) => c.field === "phone" && c.status === "pending") ?? null)).catch(() => setPending(null)), []);
  const loadHistory = useCallback(() => api.loginHistory().then(setHistory).catch(() => setHistory({ rows: [], failedSinceLastSuccess: 0, error: true })), []);
  useEffect(() => { loadPending(); loadHistory(); }, [loadPending, loadHistory]);

  const cancelPending = async () => {
    try {
      await api.cancelChange(pending.id);
      showToast("Request cancelled");
      loadPending();
    } catch {
      showToast("We could not cancel that request.");
    }
  };

  return (
    <Section id="account" title="Account and security">
      <Row label="Seller ID" hint="Used to sign in. It cannot be changed."><strong>{facts?.seller_id ?? "…"}</strong></Row>
      <Row label="Registered phone" hint="Codes are sent here. A change needs admin confirmation." stack>
        <strong aria-label="Registered phone, masked">{facts?.phone ? maskPhone(facts.phone) : "…"}</strong>
        <button type="button" className={styles.linkBtn} onClick={() => setPhoneOpen(true)} disabled={Boolean(pending)}>Request change</button>
        {pending && (
          <p className={styles.note} role="status">
            A change to <strong>{maskPhone(pending.newValue ?? pending.new_value)}</strong> is waiting for admin confirmation.{" "}
            <button type="button" className={styles.linkBtn} onClick={cancelPending}>Cancel request</button>
          </p>
        )}
      </Row>
      <Row label="Sign-in email and password" hint="Add a verified email and change your password on the Account page, where each change is confirmed with a code.">
        <Link className={styles.linkBtn} to="/business/account">Go to Account</Link>
      </Row>
      <Row label="Sign out after inactivity" hint="You are warned a minute before.">
        <Select label="Sign out after inactivity" value={String(idle)} onChange={(v) => update({ idle_minutes: Number(v) })} options={IDLE_OPTIONS.map((m) => ({ value: String(m), label: m === 60 ? "1 hour" : m === 120 ? "2 hours" : `${m} minutes` }))} />
      </Row>
      <Row label="Other devices" hint="Signs out every device except this one.">
        <Button variant="secondary" onClick={() => setSignOutOpen(true)}>Sign out other devices</Button>
      </Row>
      <Row label="Recent sign-ins" stack>
        {history === null ? <p className={styles.muted}>Loading…</p> : history.error ? <p className={styles.muted}>We could not load your sign-in history.</p> : (
          <div>
            {history.failedSinceLastSuccess > 0 && <p className={styles.note} role="status">{history.failedSinceLastSuccess} failed {history.failedSinceLastSuccess === 1 ? "attempt" : "attempts"} since your last successful sign-in.</p>}
            {history.rows.length === 0 ? <p className={styles.muted}>No sign-ins recorded yet.</p> : (
              <ul className={styles.history} aria-label="Sign-in history">
                {history.rows.map((r) => (
                  <li key={r.id}>
                    <time dateTime={r.at}>{when.format(new Date(r.at))}</time>
                    <span>{r.device} · {r.success ? "Signed in" : "Failed attempt"}</span>
                    {r.success && r.failedBefore > 0 && <span className={styles.danger}>{r.failedBefore} failed {r.failedBefore === 1 ? "attempt" : "attempts"} before this sign-in</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Row>

      <PhoneDialog open={phoneOpen} onClose={() => setPhoneOpen(false)} onSent={() => { setPhoneOpen(false); loadPending(); showToast("Request sent. An admin will confirm it."); }} />
      <SignOutDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </Section>
  );
}

function PhoneDialog({ open, onClose, onSent }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const problem = validateField(phoneSchema, value);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await api.requestChange("phone", value.trim());
      setValue("");
      onSent();
    } catch (err) {
      setError(err.code === "change_already_pending" ? "You already have a phone change waiting." : err.code === "no_change" ? "That is already your number." : err.code === "invalid_phone" ? "Enter a Kenyan number such as 0712 345 678." : "We could not send the request. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Request a phone change">
      <form onSubmit={submit} noValidate className={styles.page}>
        <p className={styles.muted}>Your number only changes after an admin confirms it. Until then, codes go to your current number.</p>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="new-phone">New phone number</label>
          <input id="new-phone" className={styles.input} value={value} onChange={(e) => setValue(e.target.value)} inputMode="tel" autoComplete="tel" aria-invalid={error ? "true" : undefined} aria-describedby={error ? "new-phone-e" : undefined} />
          {error && <p id="new-phone-e" className={styles.error} role="alert">{error}</p>}
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={busy || !value.trim()}>{busy ? "Sending…" : "Send request"}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SignOutDialog({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.signOutOthers();
      showToast(r.signedOut > 0 ? `Signed out ${r.signedOut} other ${r.signedOut === 1 ? "device" : "devices"}` : "No other devices were signed in");
      onClose();
    } catch {
      showToast("We could not sign out other devices. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Sign out other devices?">
      <p className={styles.muted}>Every other phone or computer signed in to your account will be signed out. This device stays signed in.</p>
      <div className={styles.actions}>
        <Button onClick={go} disabled={busy}>{busy ? "Signing out…" : "Sign out other devices"}</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}
