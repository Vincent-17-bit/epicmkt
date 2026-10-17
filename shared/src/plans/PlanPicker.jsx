import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faCircleCheck, faMinus } from "@fortawesome/free-solid-svg-icons";
import { formatKes, planLabel } from "../billing.js";
import styles from "./PlanPicker.module.css";

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
    <div className={styles.card} data-selected={selected ? "true" : undefined} onClick={onSelect}>
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
        <strong>{formatKes(plan.price)}</strong> {plan.price === 0 ? null : <span>per month</span>}
        {plan.trialDays > 0 ? <span className={styles.trial}> {plan.trialDays}-day free trial</span> : null}
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


const PlainButton = ({ children, ...rest }) => (
  <button type="button" {...rest}>
    {children}
  </button>
);

// The Standard / Premium package cards plus the comparison table. The seller registration form (PlanStep) and the
// admin plan editor's live preview both render this component, so the preview is exactly what sellers see.
// `readOnly` keeps the cards from changing the selection (used by the preview).
export default function PlanPicker({ category, planKey, onChoose = () => {}, error = null, groupId, Button = PlainButton, readOnly = false }) {
  const [openKeys, setOpenKeys] = useState([]);
  if (!category) return <p className={styles.empty}>Choose your business type first to see its packages.</p>;
  const { standard, premium } = category.plans;
  const rows = compareRows(standard, premium);
  const choose = (key) => (readOnly ? undefined : onChoose(key));
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
      <div key={category.id} className={styles.cards} role="radiogroup" aria-label={`Packages for ${category.name}`} id={groupId}>
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
      {error}
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
