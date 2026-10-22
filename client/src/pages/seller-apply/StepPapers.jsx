import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faCircleCheck,
  faCircleInfo,
  faFileShield,
  faFileLines,
  faUserTie
} from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import DocumentsStep from "./DocumentsStep.jsx";
import { Field, MaskedField, SelectField, TextField } from "./Field.jsx";
import { pinMask, todayISO } from "./masks.js";
import form from "./form.module.css";
import styles from "./steps.module.css";

const REG_TYPES = [
  ["sole_proprietor", "Sole proprietor"],
  ["partnership", "Partnership"],
  ["limited_company", "Limited company"]
];

const CHOICES = [
  { value: true, icon: faBuildingColumns, title: "Registered", text: "Business name, partnership or company" },
  { value: false, icon: faUserTie, title: "Not registered", text: "A sole trader or informal business" }
];

export default function PapersStep({ category, docs, showErrors }) {
  const { control, setValue } = useFormContext();
  const registered = useWatch({ control, name: "business.registered" });
  const year = new Date().getFullYear();

  return (
    <div className={styles.stack}>
      <section className={styles.block} aria-labelledby="reg-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faFileShield} />
          </span>
          <div>
            <h3 id="reg-title">Registration</h3>
            <p>Not registered is fine. You can add proof later to earn the Verified tick.</p>
          </div>
        </div>

        <Field name="business.registered">
          {(aria) => (
            <fieldset className={form.seg} {...aria}>
              <legend className={form.srOnly}>Is the business registered?</legend>
              {CHOICES.map((c) => (
                <label key={c.title} className={form.segOption}>
                  <input
                    type="radio"
                    name="registered-choice"
                    checked={registered === c.value}
                    onChange={() => setValue("business.registered", c.value, { shouldDirty: true, shouldValidate: true })}
                    aria-label={c.title}
                  />
                  <span className={form.segIcon} aria-hidden="true">
                    <FontAwesomeIcon icon={c.icon} />
                  </span>
                  <span className={form.segText}>
                    <strong>{c.title}</strong>
                    <small>{c.text}</small>
                  </span>
                  <FontAwesomeIcon icon={faCircleCheck} className={form.segTick} aria-hidden="true" />
                </label>
              ))}
            </fieldset>
          )}
        </Field>

        {registered === true && (
          <div className={form.grid}>
            <SelectField name="business.regType" label="Registration type" options={REG_TYPES} placeholder="Choose a type" />
            <TextField name="business.regNumber" label="Registration number" placeholder="For example PVT-ABC123" autoCapitalize="characters" />
            <MaskedField
              name="business.kraPin"
              label="KRA PIN"
              className={form.span2}
              hint="Starts with A or P, 9 digits, then a letter."
              placeholder="A123456789Z"
              mask={pinMask}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={11}
            />
          </div>
        )}
        {registered === false && (
          <MaskedField
            name="business.kraPin"
            label="KRA PIN"
            optional
            hint="Add it if you have one. It helps us verify you."
            placeholder="A123456789Z"
            mask={pinMask}
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
          />
        )}
      </section>

      <section className={styles.block} aria-labelledby="sbp-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faFileLines} />
          </span>
          <div>
            <h3 id="sbp-title">Single Business Permit</h3>
            <p>Issued by your county government. It must still be valid.</p>
          </div>
        </div>
        <div className={form.grid}>
          <TextField name="business.sbpNumber" label="Permit number" placeholder="As printed on the permit" autoCapitalize="characters" />
          <TextField name="business.sbpExpiry" label="Valid until" type="date" min={todayISO()} />
          <TextField
            name="business.yearEstablished"
            label="Year started"
            type="number"
            inputMode="numeric"
            optional
            min={1900}
            max={year}
            placeholder={`For example ${year - 3}`}
            className={form.span2}
          />
        </div>
      </section>

      <section className={styles.block} aria-labelledby="docs-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faCircleInfo} />
          </span>
          <div>
            <h3 id="docs-title">Upload your documents</h3>
            <p>Clear photos or PDFs. On a phone you can take the photo right here.</p>
          </div>
        </div>
        <DocumentsStep category={category} docs={docs} showErrors={showErrors} />
      </section>
    </div>
  );
}
