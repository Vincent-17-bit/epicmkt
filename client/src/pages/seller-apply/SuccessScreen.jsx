import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import Button from "../../components/Button.jsx";
import styles from "./success.module.css";

export default function SuccessScreen({ referenceNo, email }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referenceNo);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className={styles.wrap} aria-labelledby="done-title">
      <FontAwesomeIcon icon={faCircleCheck} className={styles.tick} />
      <h1 id="done-title">Application received</h1>
      <p>Keep this reference number. You need it to check your application.</p>
      <p className={styles.ref} aria-label={`Reference number ${referenceNo}`}>
        {referenceNo}
      </p>
      <Button variant="secondary" icon={faCopy} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
      <p role="status" className={styles.sent}>
        A copy was sent to {email}.
      </p>
      <ol className={styles.next}>
        <li>We review your application. You may be asked to correct items.</li>
        <li>When approved, you pay the monthly fee by M-Pesa.</li>
        <li>After payment is confirmed, we send your login details by SMS or WhatsApp.</li>
      </ol>
      <div className={styles.links}>
        <Button as={Link} to="/become-a-seller/status">
          Check my application
        </Button>
        <Button as={Link} to="/" variant="secondary">
          Home
        </Button>
      </div>
    </section>
  );
}
