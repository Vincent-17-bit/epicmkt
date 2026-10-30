import { useEffect, useState } from "react";
import { Accordion } from "@epicmkt/ui";
import { faEnvelope, faPhone } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { telLink, whatsappLink } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { FAQ, GUIDES } from "./helpContent.js";
import styles from "./help.module.css";

export default function Help() {
  const [contacts, setContacts] = useState(null);
  useEffect(() => {
    let alive = true;
    api.supportContacts().then((c) => alive && setContacts(c)).catch(() => alive && setContacts({}));
    return () => { alive = false; };
  }, []);
  const c = contacts ?? {};
  const any = c.whatsapp || c.phone || c.email;

  return (
    <div className={styles.page}>
      <h1>Help</h1>

      <section className={styles.section} aria-labelledby="faq-h">
        <h2 id="faq-h">Common questions</h2>
        <Accordion items={FAQ} idPrefix="help-faq" level={3} />
      </section>

      <section className={styles.section} aria-labelledby="guides-h">
        <h2 id="guides-h">How to</h2>
        <div className={styles.guides}>
          {GUIDES.map((g) => (
            <details key={g.id} className={styles.guide}>
              <summary>{g.title}</summary>
              <ol>{g.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="support-h">
        <h2 id="support-h">Contact support</h2>
        {contacts === null ? <p className={styles.muted}>Loading…</p> : !any ? <p className={styles.muted}>Support contact details are not available right now.</p> : (
          <>
            <div className={styles.contacts}>
              {c.whatsapp && <a className={styles.contact} href={whatsappLink(c.whatsapp)} target="_blank" rel="noopener noreferrer"><FontAwesomeIcon icon={faWhatsapp} />&nbsp;WhatsApp</a>}
              {c.phone && <a className={styles.contact} href={telLink(c.phone)}><FontAwesomeIcon icon={faPhone} />&nbsp;Call us</a>}
              {c.email && <a className={styles.contact} href={`mailto:${c.email}`}><FontAwesomeIcon icon={faEnvelope} />&nbsp;Email</a>}
            </div>
            {c.hours && <p className={styles.muted}>{c.hours}</p>}
          </>
        )}
      </section>
    </div>
  );
}
