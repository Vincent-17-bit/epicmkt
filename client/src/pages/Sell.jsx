import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChartSimple, faLocationDot, faPhone, faQrcode } from "@fortawesome/free-solid-svg-icons";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import Accordion from "../components/Accordion.jsx";
import PlansSection from "../components/PlansSection.jsx";
import { APPLY_PATH, FinalCta, SellHero } from "../components/SellBlocks.jsx";
import { formatKes, priceRange } from "../shared/billing.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useCatalog } from "./seller-apply/useCatalog.js";
import styles from "./Sell.module.css";

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
  { title: "Get contacted", text: "Customers call, message or visit you directly. You keep the full sale, with no commission." }
];

const faqs = [
  {
    q: "Does EpicMKT take a cut of my sales?",
    a: "No. You pay a flat monthly fee for your plan and every sale stays with you."
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

export default function Sell() {
  usePageTitle("Become a seller");
  const catalog = useCatalog();
  const range = priceRange(catalog.catalog?.categories ?? []);
  return (
    <>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>
      <SellHero
        id="sell-title"
        title="Get your business found by customers nearby"
        text={`List your business on EpicMKT and let people call, message you on WhatsApp or get directions in one tap.${
          range ? ` Plans start at ${formatKes(range.min)} a month.` : ""
        }`}
        actions={
          <>
            <Button as={Link} to={APPLY_PATH} size="lg" iconRight={faArrowRight}>
              List my business
            </Button>
            <Button as={Link} to="/sell#plans" variant="secondary" size="lg">
              Compare plans
            </Button>
          </>
        }
        note="No commission. A flat monthly fee, and every sale is yours."
      />

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

      <PlansSection>
        <p className={styles.more}>
          Want the details? See <Link to="/pricing">pricing</Link> and how to get the plans PDF.
        </p>
      </PlansSection>

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

      <FinalCta />
    </>
  );
}
