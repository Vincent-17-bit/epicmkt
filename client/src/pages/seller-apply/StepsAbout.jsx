import { useFormContext, useWatch } from "react-hook-form";
import { Field, SelectField, TextField } from "./Field.jsx";
import TemplateFields from "./TemplateFields.jsx";
import form from "./form.module.css";
import styles from "./steps.module.css";

export function AboutYouStep() {
  const { register, control } = useFormContext();
  const idType = useWatch({ control, name: "owner.idType" });
  return (
    <div className={form.grid}>
      <TextField name="owner.fullName" label="Full names (as on your ID)" autoComplete="name" className={form.span2} />
      <Field name="owner.idType" label="ID type">
        {(aria) => (
          <select className={form.input} {...aria} {...register("owner.idType")}>
            <option value="national_id">National ID</option>
            <option value="passport">Passport</option>
          </select>
        )}
      </Field>
      <TextField
        name="owner.idNumber"
        label={idType === "passport" ? "Passport number" : "National ID number"}
        hint={idType === "passport" ? "6 to 9 letters or digits" : "7 or 8 digits"}
        autoComplete="off"
      />
      <TextField name="phone" label="Phone number" type="tel" inputMode="tel" autoComplete="tel" hint="For example 0712 345 678" />
      <TextField name="email" label="Email address" type="email" autoComplete="email" hint="We send your reference number here" />
      <TextField name="altPhone" label="Alternative phone" type="tel" inputMode="tel" optional />
    </div>
  );
}

const REG_TYPES = [
  ["sole_proprietor", "Sole proprietor"],
  ["partnership", "Partnership"],
  ["limited_company", "Limited company"]
];

export function BusinessStep({ category }) {
  const { control, setValue } = useFormContext();
  const registered = useWatch({ control, name: "business.registered" });
  return (
    <div className={form.grid}>
      <TextField name="business.name" label="Business name" className={form.span2} autoComplete="organization" />
      <Field name="business.registered" label="Is the business registered?" className={form.span2}>
        {(aria) => (
          <div className={form.choices} role="radiogroup" aria-label="Is the business registered?" {...aria}>
            {[
              [true, "Registered"],
              [false, "Not registered"]
            ].map(([value, label]) => (
              <label key={label} className={form.choice}>
                <input
                  type="radio"
                  name="registered-choice"
                  checked={registered === value}
                  onChange={() => setValue("business.registered", value, { shouldDirty: true, shouldValidate: true })}
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </Field>
      {registered === true && (
        <>
          <SelectField name="business.regType" label="Registration type" options={REG_TYPES} />
          <TextField name="business.regNumber" label="Registration number" />
          <TextField name="business.kraPin" label="KRA PIN" hint="For example A123456789Z" autoCapitalize="characters" />
        </>
      )}
      {registered === false && (
        <TextField name="business.kraPin" label="KRA PIN" hint="For example A123456789Z" optional autoCapitalize="characters" />
      )}
      <TextField name="business.yearEstablished" label="Year established" type="number" inputMode="numeric" />
      <TextField name="business.sbpNumber" label="Single Business Permit number" />
      <TextField name="business.sbpExpiry" label="Permit expiry date" type="date" />
      <TextField
        name="business.shortDescription"
        label="Short description"
        type="textarea"
        maxLength={160}
        optional
        className={form.span2}
        hint="Up to 160 characters, no links"
      />
      <p className={`${styles.note} ${form.span2}`}>
        Your public link will be epicmkt.co.ke/s/your-shop, generated automatically when you are approved. It stays the same permanently.
      </p>
      {category && (
        <div className={`${styles.template} ${form.span2}`}>
          <h3>{category.name} details</h3>
          <TemplateFields fields={category.template} />
        </div>
      )}
    </div>
  );
}
