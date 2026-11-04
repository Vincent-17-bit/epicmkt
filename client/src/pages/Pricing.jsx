import { Link } from "react-router-dom";
import { faArrowRight, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { Container, Button, Accordion } from "@epicmkt/ui";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import PlansSection from "../components/PlansSection.jsx";
import { ContactCard } from "../components/LegalPage.jsx";
import { APPLY_PATH, FinalCta, PLANS_PDF_PATH, SellHero } from "../components/SellBlocks.jsx";
import { pricingFaqs } from "../data/faqs.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Sell.module.css";

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
          <Accordion items={pricingFaqs} idPrefix="pricing-faq" level={3} />
        </Container>
      </section>

      <FinalCta />
    </>
  );
}
