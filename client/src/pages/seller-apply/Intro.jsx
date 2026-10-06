import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClipboardCheck, faFileSignature, faMoneyBillTransfer, faStore } from "@fortawesome/free-solid-svg-icons";
import styles from "./intro.module.css";

const HOW = [
  { icon: faFileSignature, title: "Apply", text: "Fill in this form and upload your documents." },
  { icon: faClipboardCheck, title: "Review", text: "We check your details and may ask for corrections." },
  { icon: faMoneyBillTransfer, title: "Pay", text: "After approval, pay your monthly fee by M-Pesa." },
  { icon: faStore, title: "Go live", text: "We send your login and your listing goes live." }
];

const BEFORE = [
  "Your ID or passport",
  "Your Single Business Permit",
  "Your KRA PIN and registration certificate, if registered",
  "A photo of your signboard or shop front",
  "Your M-Pesa number for payment after approval"
];

export default function Intro() {
  return (
    <section className={styles.intro} aria-labelledby="intro-title">
      <div className={styles.hero}>
        <h1 id="intro-title">Put your business in front of local customers</h1>
        <p>
          EpicMKT is a free directory of local businesses across Kenya. Customers find you and contact you by call, WhatsApp or directions. You pay a simple monthly listing fee. There are no orders or payments on the site.
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
      <div className={styles.before}>
        <h2>Before you start</h2>
        <ul>
          {BEFORE.map((b) => (
            <li key={b}>
              <FontAwesomeIcon icon={faCircleCheck} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
