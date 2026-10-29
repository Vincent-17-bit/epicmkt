import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMinus, faShieldHalved, faStar } from "@fortawesome/free-solid-svg-icons";
import { compareFeatureRows, formatKes, priceBands } from "../shared/billing.js";
import { useCatalog } from "../pages/seller-apply/useCatalog.js";
import { CatalogError, CatalogLoading } from "../pages/seller-apply/CatalogState.jsx";
import Button from "./Button.jsx";
import Container from "./Container.jsx";
import { APPLY_PATH, PLANS_PDF_PATH } from "./SellBlocks.jsx";
import styles from "./PlansSection.module.css";

// A plan's text for a feature, shown only where the two plans differ ("Up to 7 photos" against "Up to 15 photos").
function Cell({ text, other, label }) {
  if (!text) {
    return (
      <>
        <FontAwesomeIcon icon={faMinus} className={styles.no} aria-hidden="true" />
        <span className={styles.srOnly}>{label}: not included</span>
      </>
    );
  }
  if (other !== undefined && other !== text) return <span className={styles.cellText}>{text}</span>;
  return (
    <>
      <FontAwesomeIcon icon={faCheck} className={styles.yes} aria-hidden="true" />
      <span className={styles.srOnly}>{label}: included</span>
    </>
  );
}

/**
 * Standard against Premium, with the price each kind of business pays. Everything comes from the same plan catalog the
 * application form uses, so this page can never quote a price or limit that the form does not.
 */
export default function PlansSection({ id = "plans", children }) {
  const catalog = useCatalog();
  const categories = catalog.catalog?.categories ?? [];
  const bands = priceBands(categories);
  const reference = categories.find((c) => c.plans?.standard && c.plans?.premium);

  let body;
  if (catalog.isLoading) {
    body = <CatalogLoading rows={4} />;
  } else if (catalog.isError) {
    body = <CatalogError onRetry={catalog.refetch} />;
  } else if (!reference || !bands.length) {
    body = (
      <p className={styles.fine}>
        Plans are not available to show right now. <Link to={PLANS_PDF_PATH}>Ask for the plans PDF</Link>.
      </p>
    );
  } else {
    const rows = compareFeatureRows(reference.plans.standard, reference.plans.premium);
    const lowStandard = Math.min(...bands.map((b) => b.standard));
    const lowPremium = Math.min(...bands.map((b) => b.premium));
    const ranged = bands.length > 1;
    body = (
      <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Comparison of Standard and Premium plans</caption>
            <thead>
              <tr>
                <td className={styles.corner} />
                <th scope="col" className={styles.plan}>
                  <span className={styles.planName}>Standard</span>
                  <span className={styles.price}>
                    {ranged && <span className={styles.from}>From </span>}
                    {formatKes(lowStandard)}
                  </span>
                  <span className={styles.per}>per month</span>
                </th>
                <th scope="col" className={`${styles.plan} ${styles.premium}`}>
                  <span className={styles.planName}>
                    <FontAwesomeIcon icon={faStar} /> Premium
                  </span>
                  <span className={styles.price}>
                    {ranged && <span className={styles.from}>From </span>}
                    {formatKes(lowPremium)}
                  </span>
                  <span className={styles.per}>per month</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((group) => (
                <GroupRows key={group.group} group={group} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={styles.corner} />
                <td className={styles.cta}>
                  <Button as={Link} to={APPLY_PATH} variant="secondary" size="sm">
                    Apply for Standard
                  </Button>
                </td>
                <td className={`${styles.cta} ${styles.premiumCell}`}>
                  <Button as={Link} to={APPLY_PATH} size="sm">
                    Apply for Premium
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className={styles.fine}>
          <FontAwesomeIcon icon={faShieldHalved} /> Prices start at the amounts shown and depend on your type of business. They are in Kenya shillings per month, with
          no commission on your sales. Applying is free and you pay only after we approve you.
        </p>
      </>
    );
  }

  return (
    <Container as="section" id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <h2 id={`${id}-title`} className={styles.h2}>
          Standard or Premium
        </h2>
        <p className={styles.lead}>Simple monthly pricing. Choose the plan that fits and apply when you are ready.</p>
      </div>
      {body}
      {children}
    </Container>
  );
}

function GroupRows({ group }) {
  return (
    <>
      <tr className={styles.groupRow}>
        <th scope="rowgroup" colSpan={3}>
          {group.group}
        </th>
      </tr>
      {group.items.map((item) => (
        <tr key={item.label}>
          <th scope="row" className={styles.rowLabel}>
            {item.label}
          </th>
          <td className={styles.cell}>
            <Cell text={item.standard} other={item.premium} label={item.label} />
          </td>
          <td className={`${styles.cell} ${styles.premiumCell}`}>
            <Cell text={item.premium} other={item.standard} label={item.label} />
          </td>
        </tr>
      ))}
    </>
  );
}
