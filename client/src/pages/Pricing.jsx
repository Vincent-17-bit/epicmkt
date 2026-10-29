import { Link } from "react-router-dom";
import { faArrowRight, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import Accordion from "../components/Accordion.jsx";
import PlansSection from "../components/PlansSection.jsx";
import { ContactCard } from "../components/LegalPage.jsx";
import { APPLY_PATH, FinalCta, PLANS_PDF_PATH, SellHero } from "../components/SellBlocks.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Sell.module.css";

const faqs = [
  {
    q: "Does EpicMKT take a cut of my sales?",
    a: "No. You pay a flat monthly fee for your plan and every sale stays with you."
  },
  {
    q: "Why does the price depend on my type of business?",
    a: "Each type of business has its own monthly price. The prices above start at the lowest, and your exact price is shown before you send your application. For the full list, ask for the plans PDF."
  },
  {
    q: "When do I pay?",
    a: "Applying is free. You pay only after we approve your application, and your listing goes live once your first payment is confirmed."
  },
  {
    q: "How do I pay?",
    a: "By M-Pesa Paybill. Use the reference in your approval message as the account number. Once you are live, use your Seller ID to renew."
  },
  {
    q: "Can I pay for more than one month?",
    a: "Yes. You can pay several months ahead, and any amount left over is kept as credit towards your next payment."
  },
  {
    q: "What if I pay late?",
    a: "There is a short grace period after your paid date. If you have not renewed by then, your listing may be taken down until you pay."
  },
  {
    q: "Can I change my plan later?",
    a: "Yes. You can upgrade from Standard to Premium from the Subscription page in your seller dashboard."
  },
  {
    q: "How do I get the plans PDF?",
    a: "Contact EpicMKT support and we will send it to you. It lists the plans and prices for every type of business."
  }
];

export default function Pricing() {
  usePageTitle("Pricing");
  return (
    <>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>

      <SellHero
        id="pricing-title"
        title="Simple monthly pricing"
        text="Choose Standard or Premium and pay one flat fee a month. The fee depends on your type of business, and every sale is yours."
        actions={
          <>
            <Button as={Link} to={APPLY_PATH} size="lg" iconRight={faArrowRight}>
              List my business
            </Button>
            <Button as={Link} to={PLANS_PDF_PATH} variant="secondary" size="lg" icon={faFilePdf}>
              Get the plans PDF
            </Button>
          </>
        }
        note="No commission. Applying is free and you pay only after we approve you."
      />

      <PlansSection />

      <Container className={styles.section}>
        <ContactCard
          id="plans-pdf-title"
          title="Want the plans PDF?"
          text="Contact EpicMKT support and we will send you the plans PDF, with the plans and prices for every type of business."
          label="Ask for the plans PDF"
          to={PLANS_PDF_PATH}
        />
      </Container>

      <section className={styles.band} aria-labelledby="pricing-faq-title">
        <Container className={`${styles.section} ${styles.narrow}`}>
          <div className={styles.head}>
            <h2 id="pricing-faq-title" className={styles.h2}>
              Questions about pricing
            </h2>
          </div>
          <Accordion items={faqs} idPrefix="pricing-faq" level={3} />
        </Container>
      </section>

      <FinalCta />
    </>
  );
}
