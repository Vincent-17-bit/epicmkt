import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCheck,
  faMinus,
  faChartSimple,
  faLocationDot,
  faPhone,
  faQrcode,
  faShieldHalved,
  faStore,
  faStar
} from "@fortawesome/free-solid-svg-icons";
import { PLAN_FEATURES, PLAN_PRICE_KES, formatKes } from "@epicmkt/shared";
import { Button, Container, Accordion } from "@epicmkt/ui";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Sell.module.css";

const REGISTER = "/sell/register";

const benefits = [
  {
    icon: faPhone,
    title: "Customers reach you in one tap",
    text: "Every listing has Call, WhatsApp and Directions buttons, so people go from finding you to contacting you instantly."
  },
  {
    icon: faLocationDot,
    title: "Found by people nearby",
    text: "Shoppers search by what they need and see how far you are, so the closest businesses get noticed."
  },
  {
    icon: faQrcode,
    title: "Your own page and QR code",
    text: "Get a page with your photos, prices, hours and offers, plus a short link and QR code to share anywhere."
  },
  {
    icon: faChartSimple,
    title: "See what is working",
    text: "Your dashboard counts views, calls, WhatsApp chats and direction requests so you know your listing is paying off."
  }
];

const steps = [
  { title: "Register your business", text: "Add your name, category, phone and WhatsApp number, location and opening hours." },
  { title: "We check your details", text: "We review your listing so customers can trust it. Checked businesses earn a Verified badge." },
  { title: "Go live", text: "Add photos, prices and offers. Your page, short link and QR code are ready to share." },
  { title: "Get contacted", text: "Customers call, message or visit you directly. You keep the sale, because EpicMKT never touches orders or payments." }
];

const yes = { yes: true };
const no = { yes: false };

const rows = [
  { label: "Your own business page", standard: yes, premium: yes },
  { label: "Call, WhatsApp and Directions buttons", standard: yes, premium: yes },
  { label: "Opening hours, services and prices", standard: yes, premium: yes },
  { label: "Short link and QR code", standard: yes, premium: yes },
  { label: "Views and contact statistics", standard: yes, premium: yes },
  { label: "Photos in your gallery", standard: { text: `Up to ${PLAN_FEATURES.standard.maxGallery}` }, premium: { text: `Up to ${PLAN_FEATURES.premium.maxGallery}` } },
  { label: "Social media links", standard: PLAN_FEATURES.standard.socials ? yes : no, premium: PLAN_FEATURES.premium.socials ? yes : no },
  { label: "Featured badge", standard: PLAN_FEATURES.standard.featured ? yes : no, premium: PLAN_FEATURES.premium.featured ? yes : no },
  { label: "Shown first in search results", standard: PLAN_FEATURES.standard.priorityRanking ? yes : no, premium: PLAN_FEATURES.premium.priorityRanking ? yes : no }
];

const faqs = [
  {
    q: "Does EpicMKT take a cut of my sales?",
    a: "No. EpicMKT is a directory and never handles orders or payments. You pay a flat monthly fee for your plan and every sale stays with you."
  },
  {
    q: "How do customers buy from me?",
    a: "They call you, message you on WhatsApp or come to your location. You agree the order and payment directly with them."
  },
  {
    q: "What do I need to get listed?",
    a: "Your business name and category, a phone and WhatsApp number, your location and opening hours. Photos, services and prices make your page stronger."
  },
  {
    q: "What does Featured mean?",
    a: "Premium businesses carry a Featured badge and appear first in search results, ahead of Standard listings."
  },
  {
    q: "What does Verified mean?",
    a: "A Verified badge shows that we have checked your business details, which helps customers trust your listing."
  },
  {
    q: "How will I know it is working?",
    a: "Your seller dashboard shows how many people viewed your page and how many called, messaged you on WhatsApp or asked for directions."
  }
];

function Mark({ cell, label }) {
  if (cell.text) return <span className={styles.cellText}>{cell.text}</span>;
  return (
    <>
      <FontAwesomeIcon icon={cell.yes ? faCheck : faMinus} className={cell.yes ? styles.yes : styles.no} aria-hidden="true" />
      <span className={styles.srOnly}>{cell.yes ? `${label}: included` : `${label}: not included`}</span>
    </>
  );
}

export default function Sell() {
  usePageTitle("Become a seller");
  return (
    <>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>
      <section className={styles.hero} aria-labelledby="sell-title">
        <Container className={styles.heroInner}>
          <span className={styles.heroIcon}>
            <FontAwesomeIcon icon={faStore} />
          </span>
          <h1 id="sell-title" className={styles.heroTitle}>
            Get your business found by customers nearby
          </h1>
          <p className={styles.heroText}>
            List your business on EpicMKT and let people call, message you on WhatsApp or get directions in one tap. Plans start at{" "}
            {formatKes(PLAN_PRICE_KES.standard)} a month.
          </p>
          <div className={styles.heroActions}>
            <Button as={Link} to={REGISTER} size="lg" iconRight={faArrowRight}>
              List my business
            </Button>
            <Button as={Link} to="/sell#plans" variant="secondary" size="lg">
              Compare plans
            </Button>
          </div>
          <p className={styles.heroNote}>No commission. EpicMKT never handles your orders or payments.</p>
        </Container>
      </section>

      <Container as="section" className={styles.section} aria-labelledby="benefits-title">
        <div className={styles.head}>
          <h2 id="benefits-title" className={styles.h2}>
            Why list on EpicMKT
          </h2>
          <p className={styles.lead}>Everything a local business needs to be found and contacted.</p>
        </div>
        <ul className={styles.benefits}>
          {benefits.map((b) => (
            <li key={b.title} className={styles.benefit}>
              <span className={styles.benefitIcon}>
                <FontAwesomeIcon icon={b.icon} />
              </span>
              <h3 className={styles.h3}>{b.title}</h3>
              <p>{b.text}</p>
            </li>
          ))}
        </ul>
      </Container>

      <section id="how" className={styles.band} aria-labelledby="how-title">
        <Container className={styles.section}>
          <div className={styles.head}>
            <h2 id="how-title" className={styles.h2}>
              How it works
            </h2>
            <p className={styles.lead}>From sign-up to your first customer in four steps.</p>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNum} aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className={styles.h3}>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Container as="section" id="plans" className={styles.section} aria-labelledby="plans-title">
        <div className={styles.head}>
          <h2 id="plans-title" className={styles.h2}>
            Standard or Premium
          </h2>
          <p className={styles.lead}>Simple monthly pricing. Choose the plan that fits and register when you are ready.</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Comparison of Standard and Premium plans</caption>
            <thead>
              <tr>
                <td className={styles.corner} />
                <th scope="col" className={styles.plan}>
                  <span className={styles.planName}>Standard</span>
                  <span className={styles.price}>{formatKes(PLAN_PRICE_KES.standard)}</span>
                  <span className={styles.per}>per month</span>
                </th>
                <th scope="col" className={`${styles.plan} ${styles.premium}`}>
                  <span className={styles.planName}>
                    <FontAwesomeIcon icon={faStar} /> Premium
                  </span>
                  <span className={styles.price}>{formatKes(PLAN_PRICE_KES.premium)}</span>
                  <span className={styles.per}>per month</span>
                </th>
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
            <tfoot>
              <tr>
                <td className={styles.corner} />
                <td className={styles.cta}>
                  <Button as={Link} to={REGISTER} variant="secondary" size="sm">
                    Choose Standard
                  </Button>
                </td>
                <td className={`${styles.cta} ${styles.premiumCell}`}>
                  <Button as={Link} to={REGISTER} size="sm">
                    Choose Premium
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={styles.fine}>
          <FontAwesomeIcon icon={faShieldHalved} /> Prices are in Kenya shillings per month. EpicMKT lists businesses only and does not handle orders or
          payments.
        </p>
      </Container>

      <section className={styles.band} aria-labelledby="sell-faq-title">
        <Container className={`${styles.section} ${styles.narrow}`}>
          <div className={styles.head}>
            <h2 id="sell-faq-title" className={styles.h2}>
              Questions from sellers
            </h2>
          </div>
          <Accordion items={faqs} idPrefix="sell-faq" level={3} />
        </Container>
      </section>

      <Container as="section" className={styles.section} aria-labelledby="final-title">
        <div className={styles.final}>
          <h2 id="final-title" className={styles.finalTitle}>
            Ready to be found?
          </h2>
          <p>Register your business and start getting calls and WhatsApp messages from people nearby.</p>
          <Button as={Link} to={REGISTER} variant="dark" size="lg" iconRight={faArrowRight}>
            List my business
          </Button>
        </div>
      </Container>
    </>
  );
}
