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
import { AboutYouStep, BusinessStep } from "./StepsAbout.jsx";
import LocationStep from "./StepLocation.jsx";
import DocumentsStep from "./DocumentsStep.jsx";
import PlanStep from "./PlanStep.jsx";
import ReviewStep from "./ReviewStep.jsx";
import SuccessScreen from "./SuccessScreen.jsx";
import LeaveDialog from "./LeaveDialog.jsx";
import PricingEditor from "./PricingEditor.jsx";
import styles from "./page.module.css";

const LEADS = [
  "Pick the type that best describes your business. This sets the documents and package options.",
  "Tell us who you are. We may call or message this number during review.",
  "Tell us about the business and its permit.",
  "Pin the business on the map and add the numbers customers can reach.",
  "Upload clear photos or PDFs of each document.",
  "Choose a package. You pay only after your application is approved.",
  "Check everything, then read and accept the terms."
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

function describe(e) {
  const code = e?.details?.error ?? e?.message;
  const map = {
    too_fast: "That was very quick. Please check your details and send again in a few seconds.",
    captcha_failed: "The human check did not pass. Please try again.",
    rate_limited: "Too many attempts. Please wait a while and try again.",
    invalid_file: "One of your files was not accepted. Replace it and send again.",
    missing_documents: "Some required documents are missing. Add them and send again.",
    legal_version_changed: "The terms were updated. Please open and read them again."
  };
  return map[code] ?? "We could not send your application. Your draft is saved. Check your connection and try again.";
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

  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const bad = document.querySelector('form [aria-invalid="true"]');
      (bad ?? document.getElementById("error-summary"))?.focus();
    });

  const next = async () => {
    const step = STEPS[idx];
    const ok = step.paths.length ? await trigger(step.paths) : true;
    let docsOk = true;
    if (step.id === "documents") {
      setAttempted(true);
      docsOk = missingSlots(cards, docs.files).length === 0 && !Object.values(docs.files).some((f) => f.status === "working");
    }
    if (!ok || !docsOk) {
      const errs = flattenErrors(methods.formState.errors).filter(({ path }) => step.paths.some((p) => path === p || path.startsWith(`${p}.`)));
      const docErrs = step.id === "documents" ? missingSlots(cards, docs.files).map((c) => ({ path: `slot-${c.key}`, message: `${c.label} is required` })) : [];
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
      if ((i < 4 || s.id === "plan") && stepHasErrors(errors, s)) out.push(`Complete "${s.title}"`);
    });
    missingSlots(cards, docs.files).forEach((c) => out.push(`Add document: ${c.label}`));
    if (Object.values(docs.files).some((f) => f.status === "working")) out.push("Wait for files to finish checking");
    if (!read.terms) out.push("Open and read the Seller Terms and Rules to the end");
    else if (!values.agreeTerms) out.push("Tick the Seller Terms and Rules box");
    if (!read.privacy) out.push("Open and read the Privacy Notice to the end");
    else if (!values.agreePrivacy) out.push("Tick the Privacy Notice box");
    if (!values.authorised) out.push("Tick the authorisation declaration");
    if (!token) out.push("Complete the human check");
    if (!legal) out.push("Wait for the terms to load");
    return out;
  }, [values, category, cards, docs.files, read, token, legal]);

  const submit = async () => {
    if (missing.length || phase === "submitting") return;
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
      setDone({ referenceNo: res.referenceNo, email: payload.email });
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
      if (code === "missing_documents") go(4);
    }
  };

  const labelOf = (slot) => cards.find((c) => c.key === slot)?.label ?? slot;
  const submitting = phase === "submitting";

  if (phase === "done" && done) {
    return (
      <div className={styles.page}>
        <SuccessScreen referenceNo={done.referenceNo} email={done.email} />
        <div className={styles.spacer} />
      </div>
    );
  }

  const step = STEPS[idx];
  const content = {
    type: <CategoryPicker catalog={catalog} />,
    you: <AboutYouStep />,
    business: <BusinessStep category={category} />,
    location: <LocationStep />,
    documents: <DocumentsStep category={category} docs={docs} showErrors={attempted} />,
    plan: <PlanStep catalog={catalog} />,
    review: (
      <ReviewStep
        category={category}
        docs={docs}
        legal={legal}
        read={read}
        onRead={(key) => setRead((r) => (r[key] ? r : { ...r, [key]: true }))}
        goTo={go}
        missing={missing}
        onToken={setToken}
      />
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
      <Stepper index={idx} onJump={go} />
      <form noValidate onSubmit={(e) => e.preventDefault()} onInputCapture={touch} onClickCapture={touch}>
        <FormProvider {...methods}>
          <section className={styles.card} aria-labelledby="step-title">
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
            <Button icon={faPaperPlane} onClick={submit} disabled={missing.length > 0 || submitting}>
              {submitting ? "Sending" : phase === "failed" ? "Retry" : "Submit application"}
            </Button>
          )}
        </div>
      </form>
      <div className={styles.spacer} />
      {import.meta.env.DEV && <PricingEditor category={category} />}
      <LeaveDialog open={blocker.state === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </div>
  );
}
