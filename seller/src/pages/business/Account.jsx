import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PASSWORD_MESSAGES, formatDate, passwordProblems } from "@epicmkt/shared";
import { planLabel } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import { PASSWORD_HINT, isEmail, signInSetup } from "../../lib/signIn.js";
import { STRIKE_LEAD, STRIKE_RISKS } from "../../lib/strikes.js";
import ShopPhotos from "../../components/shopPhotos/ShopPhotos.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./account.module.css";

const STATUS_LABEL = { pending: "Pending", live: "Live", paused: "Paused (unlisted)", suspended: "Suspended", expired: "Expired", deleted: "Deleted" };

// Used by both cards. Refreshes the seller's saved details so every screen sees the change.
function useSaved() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["subscription"] });
}

function SignInSummary({ business }) {
  const { needsEmail, needsPassword, done } = signInSetup(business);
  return (
    <section className={ui.card} aria-labelledby="signin-title">
      <h2 id="signin-title">Sign-in details</h2>
      {done ? (
        <p className={styles.ok} data-testid="signin-done">Your sign-in is set up. You can sign in with your email or your Seller ID.</p>
      ) : (
        <div className={styles.notice} data-testid="signin-setup">
          <p className={styles.lead}>Make your sign-in your own.</p>
          <p>We sent you a Seller ID and a temporary password so you could get in. To keep your account safe, do these two things below. After that you can sign in with your email and your own password.</p>
          <ol className={styles.steps}>
            <li data-done={!needsEmail}>{needsEmail ? "Add and verify your email." : "Email added and verified."}</li>
            <li data-done={!needsPassword}>{needsPassword ? "Choose your own password." : "Password chosen by you."}</li>
          </ol>
        </div>
      )}
      <dl className={styles.facts}>
        <div><dt>Seller ID</dt><dd data-testid="signin-seller-id">{business.sellerId}</dd></div>
        <div><dt>Sign-in email</dt><dd data-testid="signin-email">{business.loginEmailVerified ? business.loginEmail : "Not added yet"}</dd></div>
        <div>
          <dt>Password</dt>
          <dd data-testid="signin-password">
            {business.mustChangePassword ? "Temporary, change it" : business.passwordChangedAt ? `Changed ${formatDate(business.passwordChangedAt)}` : "Set by you"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function EmailCard({ business }) {
  const saved = useSaved();
  const [step, setStep] = useState("idle"); // idle | email | code
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const has = business.loginEmailVerified;

  const reset = () => { setStep("idle"); setEmail(""); setCurrentPassword(""); setCode(""); setError(""); };

  const sendCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!isEmail(email)) return setError("Enter a valid email address.");
    if (!currentPassword) return setError("Enter your current password.");
    setBusy(true);
    try {
      const r = await api.requestOtp({ purpose: "verify_email", email: email.trim() });
      setSentTo(r?.sentTo ?? email.trim());
      setStep("code");
    } catch (err) {
      setError(errorText(err, "We could not send the code. Check the email and try again."));
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter the code from your email.");
    setBusy(true);
    try {
      await api.setLoginEmail({ code: code.trim(), currentPassword });
      await saved();
      reset();
      setDone(true);
    } catch (err) {
      if (err?.code === "invalid_password") setStep("email");
      setError(err?.code === "invalid_code" ? "That code is not valid or has expired." : errorText(err, "We could not save your email. Check the code and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={ui.card} aria-labelledby="email-title">
      <h2 id="email-title">Sign-in email</h2>
      {done && <p className={styles.ok} role="status">Email saved. You can now sign in with it.</p>}
      {step === "idle" && (
        <>
          <p className={ui.muted}>
            {has ? <>You can sign in with <strong>{business.loginEmail}</strong>. You can also get password codes there.</> : "Add your email so you can sign in with it and get password codes by email."}
          </p>
          <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={() => { setDone(false); setStep("email"); }}>{has ? "Change email" : "Add email"}</button>
        </>
      )}
      {step === "email" && (
        <form className={styles.form} onSubmit={sendCode} noValidate>
          <p className={ui.muted}>We will send a code to this email to check it is yours. Your Seller ID will keep working.</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-email">Email address</label>
            <input id="acc-email" type="email" className={ui.input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-email-pw">Current password</label>
            <input id="acc-email-pw" type="password" className={ui.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Sending" : "Send code to this email"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={reset}>Cancel</button>
          </div>
        </form>
      )}
      {step === "code" && (
        <form className={styles.form} onSubmit={save} noValidate>
          <p className={ui.muted}>Code sent to {sentTo}. Check your inbox and spam folder.</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-email-code">Code from email</label>
            <input id="acc-email-code" className={ui.input} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save email"}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
          </div>
        </form>
      )}
    </section>
  );
}

function PasswordCard({ business }) {
  const saved = useSaved();
  const [step, setStep] = useState("idle"); // idle | code
  const [channel, setChannel] = useState("sms");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailOk = business.loginEmailVerified;
  const way = channel === "email" ? "email" : "SMS";

  const sendCode = async () => {
    setError("");
    setDone(false);
    setBusy(true);
    try {
      const r = await api.requestOtp({ purpose: "change_password", channel });
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
    if (!code.trim()) return setError(`Enter the code from your ${way}.`);
    const problems = passwordProblems(password, { sellerId: business.sellerId });
    if (problems.length) return setError(problems.map((p) => PASSWORD_MESSAGES[p]).join(" "));
    setBusy(true);
    try {
      await api.changePassword({ code: code.trim(), newPassword: password });
      await saved();
      setStep("idle");
      setCode("");
      setPassword("");
      setShow(false);
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
          <p className={ui.muted}>We send a code to confirm it is you. Choose where to get it.</p>
          <fieldset className={styles.choice}>
            <legend className={ui.label}>Send my code by</legend>
            <label className={styles.radio}>
              <input type="radio" name="otp-channel" value="sms" checked={channel === "sms"} onChange={() => setChannel("sms")} />
              <span>SMS to the phone number on your listing</span>
            </label>
            <label className={styles.radio} data-disabled={!emailOk}>
              <input type="radio" name="otp-channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} disabled={!emailOk} />
              <span>{emailOk ? <>Email to {business.loginEmail}</> : "Email (add and verify your sign-in email first)"}</span>
            </label>
          </fieldset>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <button type="button" className={`${ui.btn} ${styles.fit}`} onClick={sendCode} disabled={busy}>{busy ? "Sending" : "Send code"}</button>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <p className={ui.muted}>{sentTo ? `Code sent to ${sentTo}.` : "Code sent."}</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-code">{`Code from ${way}`}</label>
            <input id="acc-code" className={ui.input} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="acc-pw">New password</label>
            <input id="acc-pw" type={show ? "text" : "password"} className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="acc-pw-hint" />
            <p id="acc-pw-hint" className={ui.muted}>{PASSWORD_HINT}</p>
          </div>
          <label className={styles.radio}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            <span>Show password</span>
          </label>
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

      <ShopPhotos business={b} />

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

      <SignInSummary business={b} />

      <section className={ui.card} aria-labelledby="strike-title">
        <h2 id="strike-title">Strikes</h2>
        <p className={strikes > 0 ? styles.count : styles.ok} data-testid="acc-strikes">{strikes === 0 ? "No strikes. Keep it that way." : strikes === 1 ? "You have 1 strike." : `You have ${strikes} strikes.`}</p>
        <p className={ui.muted}>EpicMKT gives a strike when something on your listing breaks the rules.</p>
        <p className={styles.lead}>{STRIKE_LEAD}</p>
        <ul className={styles.risks}>{STRIKE_RISKS.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      <EmailCard business={b} />
      <PasswordCard business={b} />
    </div>
  );
}
