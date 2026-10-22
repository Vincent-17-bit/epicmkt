import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleInfo, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import { MaskedField, TextField } from "./Field.jsx";
import { ID_ORDER, ID_TYPES, cleanIdNumber, idTypeOf } from "./idTypes.js";
import { phoneDisplay, phoneMask } from "./masks.js";
import form from "./form.module.css";
import styles from "./steps.module.css";

export default function YouStep() {
  const { control, setValue, getValues, trigger, getFieldState } = useFormContext();
  const idType = useWatch({ control, name: "owner.idType" });
  const alt = useWatch({ control, name: "altPhone" });
  const [showAlt, setShowAlt] = useState(false);
  const t = idTypeOf(idType);

  const choose = (key) => {
    setValue("owner.idType", key, { shouldDirty: true });
    // Carry over what still fits; a passport letter must not stay in a digits-only box.
    const next = cleanIdNumber(key, getValues("owner.idNumber"));
    setValue("owner.idNumber", next, { shouldDirty: true });
    if (next || getFieldState("owner.idNumber").isTouched) trigger("owner.idNumber");
  };

  return (
    <div className={form.grid}>
      <TextField
        name="owner.fullName"
        label="Your full names"
        className={form.span2}
        placeholder="As they appear on your ID"
        autoComplete="name"
        autoCapitalize="words"
        maxLength={80}
        hint="Use the same spelling as your ID or passport."
      />

      <fieldset className={`${form.seg} ${form.span2}`}>
        <legend className={form.segLegend}>Which ID will you use?</legend>
        {ID_ORDER.map((key) => {
          const o = ID_TYPES[key];
          return (
            <label key={key} className={form.segOption}>
              <input type="radio" name="owner-idtype" checked={idType === key} onChange={() => choose(key)} aria-label={o.label} />
              <span className={form.segIcon} aria-hidden="true">
                <FontAwesomeIcon icon={o.icon} />
              </span>
              <span className={form.segText}>
                <strong>{o.label}</strong>
                <small>{o.blurb}</small>
              </span>
              <FontAwesomeIcon icon={faCircleCheck} className={form.segTick} aria-hidden="true" />
            </label>
          );
        })}
      </fieldset>

      {idType === "maisha_card" && (
        <p className={`${form.callout} ${form.span2}`}>
          <FontAwesomeIcon icon={faCircleInfo} />
          <span>
            Type the <strong>Maisha Namba</strong> from your card. You will upload photos of both sides of the card on the documents step.
          </span>
        </p>
      )}

      <MaskedField
        name="owner.idNumber"
        label={t.numberLabel}
        hint={t.hint}
        className={form.span2}
        mask={(v) => cleanIdNumber(idType, v)}
        placeholder={t.placeholder}
        inputMode={t.inputMode}
        maxLength={t.maxLength}
        autoComplete="off"
        autoCapitalize={t.digitsOnly ? "off" : "characters"}
        spellCheck={false}
        style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}
      />

      <MaskedField
        name="phone"
        label="Your phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0712 345 678"
        hint="We may call or message this number while we review."
        mask={phoneMask}
        tidy={phoneDisplay}
      />
      <TextField
        name="email"
        label="Email address"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="you@example.com"
        hint="Your reference number is sent here."
      />

      {showAlt || alt ? (
        <MaskedField
          name="altPhone"
          label="Another phone number"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0722 000 000"
          mask={phoneMask}
          tidy={phoneDisplay}
        />
      ) : (
        <button type="button" className={`${styles.addBtn} ${form.span2}`} onClick={() => setShowAlt(true)}>
          <FontAwesomeIcon icon={faPlus} /> Add another phone number
        </button>
      )}
    </div>
  );
}
