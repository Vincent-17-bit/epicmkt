import { useMemo } from "react";
import { exampleShortFor, firstSentence, LIMITS } from "./model.js";
import { Field, SectionCard } from "./parts.jsx";
import styles from "./editor.module.css";

export default function BasicsSection({ form, patch, errors, category, sections, focusOn }) {
  const suggestion = useMemo(() => (form.shortDescription.trim() ? "" : firstSentence(form.description)), [form.shortDescription, form.description]);
  const accept = () => {
    patch("shortDescription", suggestion);
    focusOn("shortDescription");
  };
  const listId = "editor-sections";
  return (
    <SectionCard id="basics" title="Basics" required why="Your name and descriptions are what customers read first, and what search matches against.">
      <div className={styles.grid}>
        <Field name="name" label="Name" area="name" max={LIMITS.name} value={form.name} error={errors.name} onChange={(e) => patch("name", e.target.value)} autoComplete="off"
          hint="Say what it is in plain words, like Men's fade cut or Chocolate cake, 1 kg." className={styles.span2} />
        <Field name="brand" label="Brand (optional)" area="brand" max={LIMITS.brand} value={form.brand} error={errors.brand} onChange={(e) => patch("brand", e.target.value)} autoComplete="off"
          hint="The maker or label, such as Nike or Brookside." />
        <Field name="section" label="Section" area="section" max={LIMITS.section} value={form.section} error={errors.section} onChange={(e) => patch("section", e.target.value)} list={listId} autoComplete="off"
          hint="Groups items on your page, like Haircuts or Cakes. Pick one you use already or type a new one." />
        <datalist id={listId}>{sections.map((s) => <option key={s} value={s} />)}</datalist>
      </div>

      <div className={styles.explain}>
        <p className={styles.explainTitle}>Two descriptions, two jobs</p>
        <dl className={styles.explainList}>
          <div><dt>Short description</dt><dd>One sentence that makes someone tap. It sits under the name on cards, in search results and when your item is shared.</dd></div>
          <div><dt>Description</dt><dd>The full story on the item page: what it is, who it is for, and how to use, care for or get it.</dd></div>
        </dl>
      </div>

      <Field name="shortDescription" label="Short description (optional)" area="short" max={LIMITS.shortDescription} value={form.shortDescription} error={errors.shortDescription}
        onChange={(e) => patch("shortDescription", e.target.value)} placeholder={exampleShortFor(category)} autoComplete="off"
        hint="One sentence, up to 140 characters." seen="Customers see this under the name on cards, in search and when shared." />
      {suggestion && (
        <div className={styles.suggest} data-testid="short-suggestion">
          <p className={styles.suggestText}>Your short description is empty. Want to use the first sentence of your description?</p>
          <blockquote className={styles.suggestQuote}>{suggestion}</blockquote>
          <button type="button" className={styles.btnGhost} onClick={accept}>Use the first sentence of the description</button>
        </div>
      )}

      <Field name="description" as="textarea" label="Description" area="description" max={LIMITS.description} value={form.description} error={errors.description}
        onChange={(e) => patch("description", e.target.value)} hint="Press Enter to start a new paragraph. Your paragraph breaks are kept."
        seen="Customers read this on the item page." />
    </SectionCard>
  );
}
