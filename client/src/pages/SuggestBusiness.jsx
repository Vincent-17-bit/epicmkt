import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Button, Field, Select } from "@epicmkt/ui";
import InfoPage from "../components/InfoPage.jsx";
import { ContactCard, SiblingLinks } from "../components/LegalPage.jsx";
import dialog from "../components/ReportDialog.module.css";
import { HELP_CONTACT, HELP_RELATED_LABEL, helpDocs } from "../config/help.js";
import { routes } from "../config/routes.js";
import { categories } from "../data/categories.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { SUGGEST_MAX, suggestionPath } from "../lib/suggestion.js";
import styles from "./SuggestBusiness.module.css";

// Category options grouped the way the seller form groups them.
const groups = categories.reduce((acc, c) => {
  (acc[c.group] ??= []).push(c);
  return acc;
}, {});

const docs = helpDocs(routes.suggestBusiness);

export default function SuggestBusiness() {
  usePageTitle("Suggest a business");
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", category: "", town: "", phone: "" });
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    const path = suggestionPath(form);
    if (!path) {
      setError("Enter the name of the business.");
      return;
    }
    navigate(path);
  };

  return (
    <InfoPage
      title="Suggest a business"
      intro="Know a local business that should be on EpicMKT? Tell us about it and we will look into it."
    >
      <p>Fill in what you know. Only the name is needed. On the next page you choose to send it to us by email or WhatsApp.</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        <Field label="Business name">
          <input
            className={dialog.input}
            value={form.name}
            maxLength={SUGGEST_MAX}
            autoComplete="off"
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "suggest-name-error" : undefined}
            onChange={set("name")}
          />
          {error && (
            <span id="suggest-name-error" className={dialog.error} role="alert">
              {error}
            </span>
          )}
        </Field>

        <Field label="Category (optional)">
          <Select value={form.category} onChange={set("category")}>
            <option value="">Choose a category</option>
            {Object.entries(groups).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field label="Town (optional)">
          <input className={dialog.input} value={form.town} maxLength={SUGGEST_MAX} autoComplete="off" onChange={set("town")} />
        </Field>

        <Field label="Phone or WhatsApp (optional)">
          <input className={dialog.input} type="tel" inputMode="tel" value={form.phone} maxLength={20} autoComplete="off" onChange={set("phone")} />
        </Field>

        <p className={styles.hint}>Only share a number the business uses for customers.</p>

        <div className={styles.actions}>
          <Button type="submit" iconRight={faArrowRight}>
            Continue
          </Button>
        </div>
      </form>

      <div className={styles.more}>
        <ContactCard {...HELP_CONTACT} />
        <SiblingLinks docs={docs} label={HELP_RELATED_LABEL} />
      </div>
    </InfoPage>
  );
}
