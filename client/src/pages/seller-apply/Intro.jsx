import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClipboardCheck, faClock, faFileSignature, faMoneyBillTransfer, faStore } from "@fortawesome/free-solid-svg-icons";
import styles from "./intro.module.css";

const HOW = [
  { icon: faFileSignature, title: "Apply", text: "Five short steps, about 5 minutes." },
  { icon: faClipboardCheck, title: "Review", text: "We check your details and may ask for fixes." },
  { icon: faMoneyBillTransfer, title: "Pay", text: "After approval, pay the monthly fee by M-Pesa." },
  { icon: faStore, title: "Go live", text: "We send your login and your listing goes live." }
];

const BEFORE = [
  "Your National ID, Maisha Card or passport",
  "Your Single Business Permit",
  "A photo of your signboard or shop front",
  "Your KRA PIN and registration certificate, if registered"
];

export default function Intro() {
  return (
    <section className={styles.intro} aria-labelledby="intro-title">
      <div className={styles.hero}>
        <p className={styles.eyebrow}>
          <FontAwesomeIcon icon={faClock} /> About 5 minutes. Saved as you go.
        </p>
        <h1 id="intro-title">Put your business in front of local customers</h1>
        <p className={styles.short}>Free to apply. You pay only after we approve you.</p>
        <p className={styles.long}>
          EpicMKT is a directory of local businesses across Kenya. Customers find you and contact you by call, WhatsApp or directions. You pay a simple monthly listing fee and keep every sale.
        </p>
      </div>
      <ol className={styles.how} aria-label="How it works">
        {HOW.map((h, i) => (
          <li key={h.title}>
            <span className={styles.icon}>
              <FontAwesomeIcon icon={h.icon} />
            </span>
            <strong>
              {i + 1}. {h.title}
            </strong>
            <span>{h.text}</span>
          </li>
        ))}
      </ol>
      <details className={styles.before}>
        <summary>Have these ready</summary>
        <ul>
          {BEFORE.map((b) => (
            <li key={b}>
              <FontAwesomeIcon icon={faCircleCheck} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
