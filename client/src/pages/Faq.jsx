import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import InfoPage from "../components/InfoPage.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Faq.module.css";

const faqs = [
  {
    q: "Does EpicMKT take orders or payments?",
    a: "No. EpicMKT only helps you find a business and contact it. Any order or payment is arranged directly with the business."
  },
  {
    q: "How do I contact a business?",
    a: "Each listing has Call, WhatsApp and Directions buttons. Tap one to phone the business, message it on WhatsApp or open the route in your maps app."
  },
  {
    q: "What does Featured mean?",
    a: "Featured businesses are on the Premium plan. They carry a Featured badge and are shown first in results."
  },
  {
    q: "What does Verified mean?",
    a: "A Verified badge shows a business whose details have been checked by EpicMKT."
  },
  {
    q: "Why does a business show as Closed?",
    a: "Open or Closed is based on the opening hours the business has set, in East Africa Time. Hours can change, so call ahead if you are unsure."
  },
  {
    q: "How can my business be listed?",
    a: "Choose Become a seller in the menu. Businesses pay a monthly fee for a Standard or Premium listing."
  },
  {
    q: "Is EpicMKT free to use?",
    a: "Yes. Searching and contacting businesses costs you nothing."
  }
];

export default function Faq() {
  usePageTitle("FAQs");
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <InfoPage title="Frequently asked questions">
      <div className={styles.list}>
        {faqs.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.q} className={`${styles.item} ${open ? styles.open : ""}`}>
              <h2 className={styles.heading}>
                <button
                  type="button"
                  className={styles.summary}
                  id={`faq-q-${i}`}
                  aria-expanded={open}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpenIndex(open ? null : i)}
                >
                  <span>{item.q}</span>
                  <FontAwesomeIcon icon={open ? faMinus : faPlus} className={styles.icon} />
                </button>
              </h2>
              <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className={styles.panel}>
                <div className={styles.clip}>
                  <p className={styles.answer}>{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </InfoPage>
  );
}
