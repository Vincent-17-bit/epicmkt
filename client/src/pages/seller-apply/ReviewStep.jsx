import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleXmark, faFilePdf, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import { formatKesPerMonth, planLabel } from "../../shared/billing.js";
import { ErrorLine } from "./Field.jsx";
import LegalDialog from "./LegalDialog.jsx";
import Turnstile from "./Turnstile.jsx";
import { documentCards } from "./slots.js";
import form from "./form.module.css";
import styles from "./review.module.css";

const ID_LABEL = { national_id: "National ID", passport: "Passport" };
const REG_LABEL = { sole_proprietor: "Sole proprietor", partnership: "Partnership", limited_company: "Limited company" };

function Section({ title, onEdit, rows }) {
  return (
    <section className={styles.section}>
      <header>
        <h3>{title}</h3>
        <button type="button" className={styles.edit} onClick={onEdit} aria-label={`Edit ${title}`}>
          <FontAwesomeIcon icon={faPenToSquare} />
          <span>Edit</span>
        </button>
      </header>
      <dl>
        {rows
          .filter(([, v]) => v !== undefined && v !== "" && v !== null)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export default function ReviewStep({ category, docs, legal, read, onRead, goTo, missing, onToken }) {
  const { register, control, formState } = useFormContext();
  const v = useWatch({ control });
  const [openDoc, setOpenDoc] = useState(null);
  const cards = documentCards(category, v).filter((c) => c.active && docs.files[c.key]?.file);
  const plan = category?.plans?.[v.planKey];
  const errs = formState.errors;
  const templates = (category?.template ?? []).filter((f) => v.templateValues?.[f.key] !== undefined && v.templateValues?.[f.key] !== "");
  const show = (x) => (Array.isArray(x) ? x.join(", ") : typeof x === "boolean" ? (x ? "Yes" : "No") : typeof x === "object" && x ? `${x.from ?? ""} to ${x.to ?? ""}` : String(x));

  const legalCheck = (key, name, label, title) => (
    <div className={styles.legalRow}>
      <label className={form.checkRow}>
        <input type="checkbox" disabled={!read[key]} {...register(name)} />
        <span>I have read and understood the {label}</span>
      </label>
      <button type="button" className={styles.open} onClick={() => setOpenDoc(key)}>
        {read[key] ? `Read ${title} again` : `Open ${title}`}
      </button>
      {!read[key] && <p className={form.hint}>Open it and scroll to the end to enable this box.</p>}
      <ErrorLine message={errs[name]?.message} />
    </div>
  );

  return (
    <div className={styles.wrap}>
      <Section
        title="Business type"
        onEdit={() => goTo(0)}
        rows={[["Type", category?.name], ["Package", plan ? `${planLabel(v.planKey)}, ${formatKesPerMonth(plan.price)}` : ""]]}
      />
      <Section
        title="About you"
        onEdit={() => goTo(1)}
        rows={[
          ["Full names", v.owner?.fullName],
          [ID_LABEL[v.owner?.idType] ?? "ID", v.owner?.idNumber],
          ["Phone", v.phone],
          ["Alternative phone", v.altPhone],
          ["Email", v.email]
        ]}
      />
      <Section
        title="About the business"
        onEdit={() => goTo(2)}
        rows={[
          ["Business name", v.business?.name],
          ["Registered", v.business?.registered === null ? "" : v.business?.registered ? "Registered" : "Not registered"],
          ["Registration", v.business?.registered ? `${REG_LABEL[v.business?.regType] ?? ""} ${v.business?.regNumber ?? ""}` : ""],
          ["Year established", v.business?.yearEstablished],
          ["KRA PIN", v.business?.kraPin],
          ["Permit number", v.business?.sbpNumber],
          ["Permit expiry", v.business?.sbpExpiry],
          ["Description", v.business?.shortDescription],
          ...templates.map((f) => [f.label, show(v.templateValues[f.key])])
        ]}
      />
      <Section
        title="Location and contacts"
        onEdit={() => goTo(3)}
        rows={[
          ["County", v.location?.county],
          ["Town or area", v.location?.town],
          ["Address", v.location?.address],
          ["Map pin", v.location?.lat != null ? `${v.location.lat}, ${v.location.lng}` : ""],
          ["Business phones", (v.contacts?.businessPhones ?? []).filter(Boolean).join(", ")],
          ["WhatsApp", v.contacts?.whatsappSame ? "Same as first business phone" : v.contacts?.whatsapp],
          ["Website", v.contacts?.website]
        ]}
      />
      <section className={styles.section}>
        <header>
          <h3>Documents</h3>
          <button type="button" className={styles.edit} onClick={() => goTo(4)} aria-label="Edit Documents">
            <FontAwesomeIcon icon={faPenToSquare} />
            <span>Edit</span>
          </button>
        </header>
        <ul className={styles.docs}>
          {cards.map((c) => (
            <li key={c.key}>
              {docs.files[c.key].preview ? <img src={docs.files[c.key].preview} alt="" /> : <FontAwesomeIcon icon={faFilePdf} />}
              <span>{c.label}</span>
              <small>{docs.files[c.key].file.name}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="declare-title">
        <h3 id="declare-title">Declaration</h3>
        {legalCheck("terms", "agreeTerms", "Seller Terms and Rules", "Seller Terms and Rules")}
        {legalCheck("privacy", "agreePrivacy", "Privacy Notice", "Privacy Notice")}
        <label className={form.checkRow}>
          <input type="checkbox" {...register("authorised")} />
          <span>I confirm I am authorised to represent this business and the information and documents are true and may be verified.</span>
        </label>
        <ErrorLine message={errs.authorised?.message} />
        <div className={styles.turnstile}>
          <Turnstile onToken={onToken} onError={() => onToken("")} />
        </div>
      </section>

      {missing.length > 0 && (
        <div className={styles.missing} role="status">
          <strong>Before you can submit:</strong>
          <ul>
            {missing.map((m) => (
              <li key={m}>
                <FontAwesomeIcon icon={faCircleXmark} /> {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length === 0 && (
        <p className={styles.ready}>
          <FontAwesomeIcon icon={faCircleCheck} /> Everything is ready to submit.
        </p>
      )}

      <LegalDialog
        doc={openDoc ? legal?.[openDoc] : null}
        open={!!openDoc}
        onRead={() => openDoc && onRead(openDoc)}
        onClose={() => setOpenDoc(null)}
      />
    </div>
  );
}
