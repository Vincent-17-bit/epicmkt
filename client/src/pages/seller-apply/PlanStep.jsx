import { useEffect, useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faCircleCheck, faMinus } from "@fortawesome/free-solid-svg-icons";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@epicmkt/ui";
import { formatKes, planLabel } from "../../shared/billing.js";
import { CatalogError, CatalogLoading } from "./CatalogState.jsx";
import { ErrorLine, fieldId } from "./Field.jsx";
import styles from "./plans.module.css";

const GROUPS = ["Visibility", "Catalog", "Promotions", "Tools", "Support"];
const norm = (t) => t.replace(/\d+/g, "…");

function compareRows(standard, premium) {
  const rows = [];
  for (const group of GROUPS) {
    const s = standard.features?.[group] ?? [];
    const p = premium.features?.[group] ?? [];
    const map = new Map();
    s.forEach((t) => map.set(norm(t), { label: norm(t), standard: t }));
    p.forEach((t) => map.set(norm(t), { ...(map.get(norm(t)) ?? { label: norm(t) }), premium: t }));
    if (map.size) rows.push({ group, items: [...map.values()] });
  }
  return rows;
}

function PlanCard({ planKey, plan, selected, open, onSelect, onToggle, name }) {
  const uid = useId();
  const detailsId = `${uid}-details`;
  return (
    <div
      className={styles.card}
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <div className={styles.head}>
        <label className={styles.radio}>
          <input type="radio" name={name} value={planKey} checked={selected} onChange={onSelect} onClick={(e) => e.stopPropagation()} />
          <span className={styles.planName}>{planLabel(planKey)}</span>
        </label>
        {plan.badge && <span className={styles.badge}>{plan.badge}</span>}
        {selected && (
          <span className={styles.selectedTag}>
            <FontAwesomeIcon icon={faCircleCheck} /> Selected
          </span>
        )}
      </div>
      <p className={styles.price}>
        <strong>{formatKes(plan.price)}</strong> <span>per month</span>
      </p>
      <ul className={styles.top}>
        {plan.topBenefits.map((b) => (
          <li key={b}>
            <FontAwesomeIcon icon={faCheck} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.more}
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        See all details
        <FontAwesomeIcon icon={faChevronDown} className={styles.chev} data-open={open ? "true" : undefined} />
      </button>
      <div id={detailsId} className={styles.panel} data-open={open ? "true" : undefined} inert={open ? undefined : ""}>
        <div className={styles.panelInner}>
          {GROUPS.filter((g) => plan.features?.[g]?.length).map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              <ul>
                {plan.features[g].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PlanStep({ catalog }) {
  const { control, setValue, formState } = useFormContext();
  const categoryId = useWatch({ control, name: "categoryId" });
  const planKey = useWatch({ control, name: "planKey" });
  const [openKeys, setOpenKeys] = useState([]);
  const { refetch } = catalog;
  const category = catalog.category(categoryId);
  const error = formState.errors.planKey?.message;

  const [syncedFor, setSyncedFor] = useState(null);

  useEffect(() => {
    if (!categoryId) return;
    let live = true;
    refetch().finally(() => live && setSyncedFor(categoryId));
    return () => {
      live = false;
    };
  }, [categoryId]);

  if (catalog.isLoading || (categoryId && syncedFor !== categoryId && !catalog.isError)) return <CatalogLoading rows={2} />;
  if (catalog.isError) return <CatalogError onRetry={catalog.refetch} />;
  if (!category) return <p className={styles.empty}>Choose your business type first to see its packages.</p>;

  const { standard, premium } = category.plans;
  const rows = compareRows(standard, premium);
  const choose = (key) => setValue("planKey", key, { shouldDirty: true, shouldValidate: true });
  const toggle = (key) => setOpenKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [key]));
  const allOpen = openKeys.length === 2;

  return (
    <div>
      <div className={styles.top2}>
        <h3 key={category.id} className={styles.for}>
          Packages for {category.name}
        </h3>
        <Button variant="secondary" size="sm" onClick={() => setOpenKeys(allOpen ? [] : ["standard", "premium"])}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <div
        key={category.id}
        className={styles.cards}
        role="radiogroup"
        aria-label={`Packages for ${category.name}`}
        id={fieldId("planKey")}
      >
        {["standard", "premium"].map((key) => (
          <PlanCard
            key={key}
            planKey={key}
            plan={category.plans[key]}
            selected={planKey === key}
            open={openKeys.includes(key)}
            onSelect={() => choose(key)}
            onToggle={() => toggle(key)}
            name="plan-choice"
          />
        ))}
      </div>
      <ErrorLine message={error} />
      <p className={styles.pay}>You pay nothing now. After we approve your application, you pay by M-Pesa and we activate your listing.</p>

      <div className={styles.compare}>
        <h3>Compare all features</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Standard</th>
              <th scope="col">Premium</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price per month</th>
              <td>{formatKes(standard.price)}</td>
              <td>{formatKes(premium.price)}</td>
            </tr>
            {rows.map((g) => (
              <Group key={g.group} group={g} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Group({ group }) {
  const cell = (text, other) =>
    text ? (
      <td>
        <FontAwesomeIcon icon={faCheck} aria-label="Included" />
        {other !== undefined && text !== other && <span className={styles.cellText}> {text}</span>}
      </td>
    ) : (
      <td>
        <FontAwesomeIcon icon={faMinus} aria-label="Not included" />
      </td>
    );
  return (
    <>
      <tr className={styles.groupRow}>
        <th scope="rowgroup" colSpan={3}>
          {group.group}
        </th>
      </tr>
      {group.items.map((it) => (
        <tr key={it.label}>
          <th scope="row">{it.label}</th>
          {cell(it.standard, it.premium)}
          {cell(it.premium, it.standard)}
        </tr>
      ))}
    </>
  );
}
