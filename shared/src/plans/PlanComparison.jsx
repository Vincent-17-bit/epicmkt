import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faMinus, faStar } from '@fortawesome/free-solid-svg-icons';
import { PLAN_LABELS } from '../billing.js';
import { buildPlanRows, planHeader } from './rows.js';
import styles from './PlanComparison.module.css';

function Mark({ cell, label }) {
  if (cell.list) {
    return (
      <ul className={styles.list}>
        {cell.list.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    );
  }
  if (cell.text) return <span className={styles.cellText}>{cell.text}</span>;
  return (
    <>
      <FontAwesomeIcon icon={cell.yes ? faCheck : faMinus} className={cell.yes ? styles.yes : styles.no} aria-hidden="true" />
      <span className={styles.srOnly}>{cell.yes ? `${label}: included` : `${label}: not included`}</span>
    </>
  );
}

// The one Standard / Premium table. The public Become a Seller page and the admin plan preview both render this,
// so what an admin sees beside the editor is what sellers see.
export default function PlanComparison({ plans, globalLimits, renderCta }) {
  const rows = buildPlanRows({ plans, globalLimits });
  const head = { standard: planHeader(plans?.standard), premium: planHeader(plans?.premium) };
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Comparison of Standard and Premium plans</caption>
        <thead>
          <tr>
            <td className={styles.corner} />
            {['standard', 'premium'].map((key) => (
              <th key={key} scope="col" className={`${styles.plan} ${key === 'premium' ? styles.premium : ''}`}>
                <span className={styles.planName}>
                  {key === 'premium' ? <FontAwesomeIcon icon={faStar} /> : null} {PLAN_LABELS[key]}
                </span>
                {head[key].badge ? <span className={styles.badge}>{head[key].badge}</span> : null}
                <span className={styles.price}>{head[key].price}</span>
                {head[key].free ? null : <span className={styles.per}>per month</span>}
                {head[key].trial ? <span className={styles.trial}>{head[key].trial}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className={styles.rowLabel}>
                {row.label}
              </th>
              <td className={styles.cell}>
                <Mark cell={row.standard} label={row.label} />
              </td>
              <td className={`${styles.cell} ${styles.premiumCell}`}>
                <Mark cell={row.premium} label={row.label} />
              </td>
            </tr>
          ))}
        </tbody>
        {renderCta ? (
          <tfoot>
            <tr>
              <td className={styles.corner} />
              <td className={styles.cta}>{renderCta('standard')}</td>
              <td className={`${styles.cta} ${styles.premiumCell}`}>{renderCta('premium')}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
