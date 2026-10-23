import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PASSWORD_MESSAGES, passwordProblems } from "@epicmkt/shared";
import { planLabel } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import { STRIKE_LEAD, STRIKE_RISKS } from "../../lib/strikes.js";
import ui from "../../styles/ui.module.css";
import styles from "./account.module.css";

const STATUS_LABEL = { pending: "Pending", live: "Live", paused: "Paused (unlisted)", suspended: "Suspended", expired: "Expired", deleted: "Deleted" };

function PasswordCard({ sellerId }) {
  const [step, setStep] = useState("idle");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setError("");
    setDone(false);
    setBusy(true);
    try {
      const r = await api.requestOtp();
      setSentTo(r?.sentTo ?? "");
      setStep("code");
    } catch (err) {
      setError(errorText(err, "We could not send the code. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter the code from your SMS.");
    const problems = passwordProblems(password, { sellerId });
    if (problems.length) return setError(problems.map((p) => PASSWORD_MESSAGES[p]).join(" "));
    setBusy(true);
    try {
      await api.changePassword({ code: code.trim(), newPassword: password });
      setStep("idle");
      setCode("");
      setPassword("");
      setDone(true);
    } catch (err) {
      setError(err?.code === "invalid_code" ? "That code is not valid or has expired." : errorText(err, "We could not change your password. Check the code and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={ui.card} aria-labelledby="pw-title">
      <h2 id="pw-title">Password</h2>
      {done && <p className={styles.ok} role="status">Your password was changed.</p>}
      {step === "idle" ? (
        <>
          <p className={ui.muted}>We send a code by SMS to confirm it is you.</p>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={sendCode} disabled={busy}>{busy ? "Sending" : "Send code"}</button>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <p className={ui.muted}>{sentTo ? `Code sent to ${sentTo}.` : "Code sent."}</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-code">Code from SMS</label>
            <input id="acc-code" className={ui.input} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-pw">New password</label>
            <input id="acc-pw" type="password" className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Change password"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setStep("idle"); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Account() {
  const sub = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription });
  if (sub.isLoading) return <div className={ui.page}><p role="status">Loading</p></div>;
  if (sub.error) return <div className={ui.page}><p className={ui.error} role="alert">We could not load your account. Check your connection and refresh.</p></div>;
  const b = sub.data.business;
  const strikes = b.strikes ?? 0;

  return (
    <div className={ui.page}>
      <div className={ui.pageHead}>
        <h1>Account</h1>
        <p className={ui.muted}>{b.name}</p>
      </div>

      <section className={ui.card} aria-labelledby="shop-title">
        <h2 id="shop-title">Your shop</h2>
        <dl className={styles.facts}>
          <div><dt>Shop name</dt><dd data-testid="acc-name">{b.name}</dd></div>
          <div><dt>Seller ID</dt><dd data-testid="acc-seller-id">{b.sellerId}</dd></div>
          <div><dt>Category</dt><dd>{b.categoryName}</dd></div>
          <div><dt>Plan</dt><dd>{planLabel(b.planKey)}</dd></div>
          <div><dt>Listing</dt><dd>{STATUS_LABEL[b.status] ?? b.status}</dd></div>
          <div><dt>Verification</dt><dd>{b.verificationLevel === "verified" ? "Verified" : "Not verified"}</dd></div>
        </dl>
      </section>

      <section className={ui.card} aria-labelledby="strike-title">
        <h2 id="strike-title">Strikes</h2>
        <p className={strikes > 0 ? styles.count : styles.ok} data-testid="acc-strikes">{strikes === 0 ? "No strikes. Keep it that way." : strikes === 1 ? "You have 1 strike." : `You have ${strikes} strikes.`}</p>
        <p className={ui.muted}>EpicMKT gives a strike when something on your listing breaks the rules.</p>
        <p className={styles.lead}>{STRIKE_LEAD}</p>
        <ul className={styles.risks}>{STRIKE_RISKS.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      <PasswordCard sellerId={b.sellerId} />
    </div>
  );
}
