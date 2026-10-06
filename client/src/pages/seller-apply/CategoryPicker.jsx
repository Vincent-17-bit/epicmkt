import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import { categoryIcon } from "./categoryIcons.js";
import { documentCards } from "./slots.js";
import { CatalogError, CatalogLoading } from "./CatalogState.jsx";
import { ErrorLine, fieldId } from "./Field.jsx";
import form from "./form.module.css";
import styles from "./categoryPicker.module.css";

export default function CategoryPicker({ catalog }) {
  const { register, setValue, control, formState } = useFormContext();
  const selected = useWatch({ control, name: "categoryId" });
  const values = useWatch({ control });
  const [query, setQuery] = useState("");
  const error = formState.errors.categoryId?.message;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (catalog.catalog?.categories ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
    const map = new Map();
    list.forEach((c) => map.set(c.group, [...(map.get(c.group) ?? []), c]));
    return [...map.entries()];
  }, [catalog.catalog, query]);

  if (catalog.isLoading) return <CatalogLoading rows={6} />;
  if (catalog.isError) return <CatalogError onRetry={catalog.refetch} />;

  const chosen = catalog.category(selected);
  const docs = documentCards(chosen, values).filter((d) => d.state !== "optional" || d.active);

  const pick = (id) => {
    if (id === selected) return;
    setValue("categoryId", id, { shouldDirty: true, shouldValidate: true });
    setValue("templateValues", {}, { shouldDirty: true });
    setValue("conditionalDocs", {}, { shouldDirty: true });
  };

  return (
    <div>
      <div className={`${form.field} ${styles.search}`}>
        <label htmlFor="category-search" className={form.label}>
          Search business types
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="category-search"
            type="search"
            className={form.input}
            style={{ paddingLeft: "2.5rem" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example bakery, pharmacy, gas"
          />
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            style={{ position: "absolute", left: 14, top: 15, color: "var(--text-muted)" }}
          />
        </div>
      </div>
      <input type="hidden" {...register("categoryId")} />
      <div role="radiogroup" aria-label="Business type" id={fieldId("categoryId")} aria-describedby={error ? "category-err" : undefined}>
        {groups.map(([group, list]) => (
          <fieldset key={group} className={styles.group}>
            <legend>{group}</legend>
            <div className={styles.list}>
              {list.map((c) => (
                <label key={c.id} className={styles.option}>
                  <input
                    type="radio"
                    name="category-choice"
                    checked={selected === c.id}
                    onChange={() => pick(c.id)}
                    aria-label={c.name}
                  />
                  <span className={styles.icon}>
                    <FontAwesomeIcon icon={categoryIcon(c.icon)} />
                  </span>
                  <span className={styles.name}>{c.name}</span>
                  {selected === c.id && <FontAwesomeIcon icon={faCircleCheck} className={styles.tick} />}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {groups.length === 0 && <p className={styles.empty}>No business type matches your search.</p>}
      </div>
      <ErrorLine id="category-err" message={error} />
      {chosen && (
        <section className={styles.docs} aria-live="polite">
          <h3>Documents you will need for {chosen.name}</h3>
          <ul>
            {docs.map((d) => (
              <li key={d.key}>
                {d.label}
                {d.state === "optional" && " (optional)"}
                {d.state === "conditional" && ` (if: ${d.condition?.toLowerCase()})`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
