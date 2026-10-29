import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCircleExclamation, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import Button from "../../components/Button.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { getLegalDocs, submitApplication } from "../../api/applications/index.js";
import { clearDraft, loadDraft, loadDraftFiles, saveDraft } from "./draftStore.js";
import { STEPS, emptyValues, flattenErrors, makeResolver, stepHasErrors, toPayload, validateAll } from "./formModel.js";
import { documentCards, missingSlots } from "./slots.js";
import { fieldId } from "./Field.jsx";
import { useCatalog } from "./useCatalog.js";
import { useDocs } from "./useDocs.js";
import Intro from "./Intro.jsx";
import Stepper from "./Stepper.jsx";
import CategoryPicker from "./CategoryPicker.jsx";
import BusinessStep from "./StepBusiness.jsx";
import YouStep from "./StepYou.jsx";
import LocationStep from "./StepLocation.jsx";
import PapersStep from "./StepPapers.jsx";
import PlanStep from "./PlanStep.jsx";
import ReviewStep from "./ReviewStep.jsx";
import SuccessScreen from "./SuccessScreen.jsx";
import { saveSession } from "./status/sessionStore.js";
import LeaveDialog from "./LeaveDialog.jsx";
import PricingEditor from "./PricingEditor.jsx";
import styles from "./page.module.css";

const LEADS = [
  "Pick your business type, then name it. Everything is required unless marked optional.",
  "Tell us who you are. We may call or message this number while we review.",
  "Show customers where you are and how to reach you.",
  "Your permit details and clear photos of your documents.",
  "Choose a package, check your answers and send. You pay only after approval."
];

const merge = (base, saved) => ({
  ...base,
  ...saved,
  owner: { ...base.owner, ...saved.owner },
  business: { ...base.business, ...saved.business },
  location: { ...base.location, ...saved.location },
  contacts: { ...base.contacts, ...saved.contacts, socials: { ...base.contacts.socials, ...saved.contacts?.socials } },
  agreeTerms: false,
  agreePrivacy: false,
  authorised: false
});

const stepOfPath = (path) => Math.max(0, STEPS.findIndex((s) => s.paths.some((p) => path === p || path.startsWith(`${p}.`))));

const MESSAGES = {
  too_fast: "That was very quick. Please check your details and send again in a few seconds.",
  captcha_failed: "The human check did not pass. Please tick it again and send.",
  rate_limited: "You have tried a few times already. Please wait a while, then send again.",
  invalid: "Some of your answers were not accepted. Go back, check each step and send again.",
  invalid_files: "Your documents could not be read. Add them again and send.",
  invalid_file: "One of your files was not accepted. Replace it and send again.",
  missing_documents: "Some required documents are missing. Add them and send again.",
  unknown_category: "That business type is no longer available. Go back to step 1 and choose again.",
  unknown_plan: "That package is no longer available. Go to the last step and choose again.",
  legal_version_changed: "The terms were updated. Please open and read them again."
};

const OFFLINE = "We could not reach EpicMKT. Check your connection and try again. Your draft is saved.";
const UPLOAD = "A file did not finish uploading. Check your connection and send again. Your draft is saved.";
const SERVER = "Something went wrong on our side, not yours. Your draft is saved. Please try again in a few minutes.";

function describe(e) {
  const code = e?.details?.error ?? e?.message;
  if (MESSAGES[code]) return MESSAGES[code];
  if (e?.name === "FunctionsFetchError" || (typeof navigator !== "undefined" && navigator.onLine === false)) return OFFLINE;
  if (String(e?.name).startsWith("Storage")) return UPLOAD;
  return SERVER;
}

export default function BecomeASeller() {
  usePageTitle("Become a seller");
  const catalog = useCatalog();
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const legalQuery = useQuery({ queryKey: ["seller-legal"], queryFn: getLegalDocs, staleTime: 60_000 });
  const legal = legalQuery.data ?? null;
  const docs = useDocs();

  const methods = useForm({
    defaultValues: emptyValues(),
    resolver: makeResolver((id) => catalogRef.current.category(id)),
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false
  });
  const { getValues, setValue, trigger, reset, setError, control, formState } = methods;
  const values = useWatch({ control });

  const [idx, setIdx] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [summary, setSummary] = useState([]);
  const [pending, setPending] = useState(() => loadDraft());
  const [ready, setReady] = useState(() => !loadDraft());
  const [read, setRead] = useState({ terms: false, privacy: false });
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [fileStatus, setFileStatus] = useState({});
  const [done, setDone] = useState(null);
  const startedAt = useRef(null);
  const hp = useRef(null);
  const title = useRef(null);
  const category = catalog.category(values.categoryId);
  const cards = useMemo(() => documentCards(category, values), [category, values]);
  const fileCount = Object.values(docs.files).filter((f) => f.file).length;
  const dirty = (formState.isDirty || fileCount > 0) && phase !== "done";
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!legal) return;
    setValue("termsVersion", legal.terms.version);
    setValue("privacyVersion", legal.privacy.version);
  }, [legal]);

  useEffect(() => {
    if (!ready || phase === "done" || (!formState.isDirty && idx === 0 && fileCount === 0)) return undefined;
    const t = setTimeout(() => saveDraft({ values: { ...values, agreeTerms: false, agreePrivacy: false, authorised: false }, step: idx }), 500);
    return () => clearTimeout(t);
  }, [values, idx, ready, phase]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => {
    startedAt.current ??= Date.now();
  };

  const resume = async () => {
    touch();
    reset(merge(emptyValues(), pending.values ?? {}));
    docs.restore(await loadDraftFiles());
    setIdx(Math.min(pending.step ?? 0, STEPS.length - 1));
    setPending(null);
    setReady(true);
  };

  const discard = async () => {
    await clearDraft();
    setPending(null);
    setReady(true);
  };

  const go = useCallback((i) => {
    setIdx(i);
    setSummary([]);
    setAttempted(false);
    document.getElementById("seller-scroll")?.scrollTo?.({ top: 0 });
    requestAnimationFrame(() => title.current?.focus());
  }, []);

  // Bring the first problem into the middle of the screen, right where its message sits.
  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const bad = document.querySelector('form [aria-invalid="true"]');
      const note = document.querySelector("form [data-error]");
      const target = bad ?? note?.closest("[data-invalid]") ?? note;
      if (!target) return document.getElementById("error-summary")?.focus();
      target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (bad) bad.focus({ preventScroll: true });
    });

  const next = async () => {
    const step = STEPS[idx];
    const ok = step.paths.length ? await trigger(step.paths) : true;
    let docsOk = true;
    if (step.id === "papers") {
      setAttempted(true);
      docsOk = missingSlots(cards, docs.files).length === 0 && !Object.values(docs.files).some((f) => f.status === "working");
    }
    if (!ok || !docsOk) {
      const errs = flattenErrors(methods.formState.errors).filter(({ path }) => step.paths.some((p) => path === p || path.startsWith(`${p}.`)));
      const docErrs = step.id === "papers" ? missingSlots(cards, docs.files).map((c) => ({ path: `slot-${c.key}`, message: `${c.label} is required` })) : [];
      setSummary([...errs, ...docErrs]);
      focusFirstError();
      return;
    }
    go(idx + 1);
  };

  const missing = useMemo(() => {
    const out = [];
    const errors = validateAll(values, category);
    STEPS.forEach((s, i) => {
      if (s.id !== "send" && stepHasErrors(errors, s)) out.push(`Complete "${s.title}"`);
    });
    if (!values.planKey) out.push("Choose a package");
    missingSlots(cards, docs.files).forEach((c) => out.push(`Add document: ${c.label}`));
    if (Object.values(docs.files).some((f) => f.status === "working")) out.push("Wait for files to finish checking");
    if (!read.terms) out.push("Open and read the Seller Terms and Rules to the end");
    else if (!values.agreeTerms) out.push("Tick the Seller Terms and Rules box");
    if (!read.privacy) out.push("Open and read the Privacy Notice to the end");
    else if (!values.agreePrivacy) out.push("Tick the Privacy Notice box");
    if (!values.authorised) out.push("Tick the authorisation declaration");
    if (!token) out.push("Complete the human check");
    if (!legal) out.push(legalQuery.isError ? "Reload the terms and privacy notice" : "Wait for the terms to load");
    return out;
  }, [values, category, cards, docs.files, read, token, legal, legalQuery.isError]);

  const [sendTried, setSendTried] = useState(false);

  const submit = async () => {
    if (phase === "submitting") return;
    if (missing.length || !token) {
      // Show every problem under its own box, then take the person to the first one.
      setSendTried(true);
      await trigger(["planKey", "agreeTerms", "agreePrivacy", "authorised"]);
      focusFirstError();
      return;
    }
    touch();
    setPhase("submitting");
    setSubmitError("");
    const v = getValues();
    const payload = toPayload(v, category);
    const files = cards.filter((c) => c.active && docs.files[c.key]?.file).map((c) => ({ slot: c.key, file: docs.files[c.key].file }));
    setFileStatus(Object.fromEntries(files.map((f) => [f.slot, "queued"])));
    try {
      const res = await submitApplication(
        { payload, files, turnstileToken: token, startedAt: startedAt.current, hp: hp.current?.value ?? "" },
        (slot, status) => setFileStatus((s) => ({ ...s, [slot]: status }))
      );
      await clearDraft();
      docs.reset();
      if (res.session) saveSession(res.session);
      setDone({ referenceNo: res.referenceNo, email: payload.email, remembered: !!res.session });
      setPhase("done");
    } catch (e) {
      setPhase("failed");
      setSubmitError(describe(e));
      const code = e?.details?.error ?? e?.message;
      if (code === "captcha_failed") setToken("");
      if (code === "legal_version_changed") {
        setRead({ terms: false, privacy: false });
        legalQuery.refetch();
      }
      if (code === "invalid" && Array.isArray(e.details?.issues)) {
        e.details.issues.forEach((i) => setError(i.path, { type: "server", message: i.message }));
        go(stepOfPath(e.details.issues[0]?.path ?? ""));
      }
      if (code === "missing_documents") go(3);
    }
  };

  const labelOf = (slot) => cards.find((c) => c.key === slot)?.label ?? slot;
  const submitting = phase === "submitting";

  if (phase === "done" && done) {
    return (
      <div className={styles.page}>
        <SuccessScreen referenceNo={done.referenceNo} email={done.email} remembered={done.remembered} />
        <div className={styles.spacer} />
      </div>
    );
  }

  const step = STEPS[idx];
  const content = {
    business: <BusinessStep catalog={catalog} category={category} />,
    you: <YouStep />,
    place: <LocationStep />,
    papers: <PapersStep category={category} docs={docs} showErrors={attempted} />,
    send: (
      <div className={styles.sendStack}>
        <PlanStep catalog={catalog} />
        {legalQuery.isError && !legal && (
          <div className={styles.notice} role="alert">
            <span>We could not load the Seller Terms and Privacy Notice. You need them to send your application.</span>
            <Button size="sm" onClick={() => legalQuery.refetch()} disabled={legalQuery.isFetching}>
              {legalQuery.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </div>
        )}
        <ReviewStep
          category={category}
          docs={docs}
          legal={legal}
          read={read}
          onRead={(key) => setRead((r) => (r[key] ? r : { ...r, [key]: true }))}
          goTo={go}
          missing={missing}
          onToken={setToken}
          token={token}
          tried={sendTried}
        />
      </div>
    )
  }[step.id];

  return (
    <div className={styles.page}>
      {idx === 0 && <Intro />}
      {pending && !ready && (
        <div className={styles.notice} role="region" aria-label="Saved draft">
          <span>You have a saved draft on this device. Would you like to continue where you stopped?</span>
          <Button size="sm" onClick={resume}>
            Resume your draft
          </Button>
          <Button size="sm" variant="secondary" onClick={discard}>
            Start fresh
          </Button>
        </div>
      )}
      <div className={styles.shell}>
      <aside className={styles.aside}>
        <Stepper index={idx} onJump={go} />
      </aside>
      <form className={styles.formCol} noValidate onSubmit={(e) => e.preventDefault()} onInputCapture={touch} onClickCapture={touch}>
        <FormProvider {...methods}>
          <section className={styles.card} aria-labelledby="step-title">
            <p className={styles.eyebrow}>
              Step {idx + 1} of {STEPS.length}
            </p>
            <h2 id="step-title" ref={title} tabIndex={-1}>
              {step.title}
            </h2>
            <p className={styles.lead}>{LEADS[idx]}</p>
            {summary.length > 0 && (
              <div className={styles.summary} id="error-summary" tabIndex={-1} role="alert">
                <h3>
                  <FontAwesomeIcon icon={faCircleExclamation} /> {summary.length} {summary.length === 1 ? "thing needs" : "things need"} your attention
                </h3>
                <ul>
                  {summary.map((s) => (
                    <li key={s.path}>
                      <a href={`#${s.path.startsWith("slot-") ? s.path : fieldId(s.path)}`}>{s.message}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {content}
          </section>
        </FormProvider>

        <input ref={hp} name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

        {(submitting || phase === "failed") && Object.keys(fileStatus).length > 0 && (
          <ul className={styles.fileStatus} aria-label="Upload progress">
            {Object.entries(fileStatus).map(([slot, status]) => (
              <li key={slot}>
                <span>
                  {labelOf(slot)}: {{ queued: "Waiting", compressing: "Compressing", uploading: "Uploading", done: "Done", failed: "Failed" }[status]}
                </span>
                <div className={styles.indeterminate} data-state={status} />
              </li>
            ))}
          </ul>
        )}
        {submitError && (
          <div className={styles.banner} role="alert">
            <FontAwesomeIcon icon={faCircleExclamation} /> {submitError}
          </div>
        )}

        <div className={styles.actions}>
          {idx > 0 && (
            <Button variant="secondary" icon={faArrowLeft} onClick={() => go(idx - 1)} disabled={submitting}>
              Back
            </Button>
          )}
          {idx < STEPS.length - 1 ? (
            <Button iconRight={faArrowRight} onClick={next}>
              Continue
            </Button>
          ) : (
            <Button icon={faPaperPlane} onClick={submit} disabled={submitting}>
              {submitting ? "Sending your application" : phase === "failed" ? "Try again" : "Send application"}
            </Button>
          )}
        </div>
      </form>
      </div>
      <div className={styles.spacer} />
      {import.meta.env.DEV && <PricingEditor category={category} />}
      <LeaveDialog open={blocker.state === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </div>
  );
}
