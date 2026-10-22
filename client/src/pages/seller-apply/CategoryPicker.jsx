import { useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faFileLines, faMagnifyingGlass, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
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
  const [changing, setChanging] = useState(false);
  const summary = useRef(null);
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
  const showGrid = !chosen || changing;
  const docs = documentCards(chosen, values).filter((d) => d.state !== "optional" || d.active);

  const pick = (id) => {
    setChanging(false);
    setQuery("");
    if (id !== selected) {
      setValue("categoryId", id, { shouldDirty: true, shouldValidate: true });
      setValue("templateValues", {}, { shouldDirty: true });
      setValue("conditionalDocs", {}, { shouldDirty: true });
      // The grid folds away; bring the summary and the next boxes into view.
      requestAnimationFrame(() => summary.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
    }
  };

  return (
    <div className={styles.wrap}>
      <input type="hidden" {...register("categoryId")} />

      {chosen && !changing && (
        <div className={styles.chosen} ref={summary}>
          <span className={styles.chosenIcon} aria-hidden="true">
            <FontAwesomeIcon icon={categoryIcon(chosen.icon)} />
          </span>
          <div className={styles.chosenText}>
            <small>Your business type</small>
            <strong>{chosen.name}</strong>
          </div>
          <button type="button" className={styles.change} onClick={() => setChanging(true)} aria-label={`Change business type, now ${chosen.name}`}>
            <FontAwesomeIcon icon={faPenToSquare} />
            <span>Change</span>
          </button>
        </div>
      )}

      {showGrid && (
        <>
          <div className={`${form.field} ${styles.search}`}>
            <label htmlFor="category-search" className={form.label}>
              What kind of business is it?
            </label>
            <div className={styles.searchBox}>
              <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
              <input
                id="category-search"
                type="search"
                className={`${form.input} ${styles.searchInput}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, for example bakery, pharmacy, gas"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>
          <div role="radiogroup" aria-label="Business type" id={fieldId("categoryId")} aria-describedby={error ? "category-err" : undefined}>
            {groups.map(([group, list]) => (
              <fieldset key={group} className={styles.group}>
                <legend>{group}</legend>
                <div className={styles.list}>
                  {list.map((c) => (
                    <label key={c.id} className={styles.option}>
                      <input type="radio" name="category-choice" checked={selected === c.id} onChange={() => pick(c.id)} aria-label={c.name} />
                      <span className={styles.icon}>
                        <FontAwesomeIcon icon={categoryIcon(c.icon)} />
                      </span>
                      <span className={styles.name}>{c.name}</span>
                      <FontAwesomeIcon icon={faCircleCheck} className={styles.tick} />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {groups.length === 0 && <p className={styles.empty}>No business type matches “{query}”. Try a simpler word, like “food” or “repair”.</p>}
          </div>
          {changing && (
            <button type="button" className={styles.cancel} onClick={() => setChanging(false)}>
              Keep {chosen.name}
            </button>
          )}
        </>
      )}
      <ErrorLine id="category-err" message={error} />

      {chosen && !changing && (
        <section className={styles.docs} aria-live="polite">
          <h3>
            <FontAwesomeIcon icon={faFileLines} /> Documents you will need for {chosen.name}
          </h3>
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
