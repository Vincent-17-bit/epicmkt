import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { faChevronDown, faEnvelope, faMagnifyingGlass, faPhone, faXmark } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { telLink, whatsappLink } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { FAQ, GUIDES } from "./helpContent.js";
import ui from "../styles/ui.module.css";
import styles from "./help.module.css";

const GUIDE_LINKS = {
  items: ["/business/catalog", "My listings"],
  closing: ["/business/exceptions", "Closed days"],
  prices: ["/business/catalog", "My listings"],
  questions: ["/business/questions", "Questions"],
  pay: ["/business/subscription", "Subscription"],
  qr: ["/business/qr", "QR poster"]
};

function Entry({ title, meta, open, onToggle, children }) {
  const id = useId();
  return (
    <div className={styles.entry} data-open={open}>
      <h3 className={styles.entryHead}>
        <button type="button" className={styles.entryBtn} aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className={styles.entryTitle}>{title}</span>
          {meta && <span className={styles.entryMeta}>{meta}</span>}
          <FontAwesomeIcon icon={faChevronDown} className={styles.chevron} aria-hidden="true" />
        </button>
      </h3>
      {open && <div id={id} role="region" aria-label={title} className={styles.entryBody}>{children}</div>}
    </div>
  );
}

export default function Help() {
  const [contacts, setContacts] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let alive = true;
    api.supportContacts().then((c) => alive && setContacts(c)).catch(() => alive && setContacts({}));
    return () => { alive = false; };
  }, []);
  const c = contacts ?? {};
  const any = c.whatsapp || c.phone || c.email;

  const q = query.trim().toLowerCase();
  const faq = useMemo(() => (q ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q)) : FAQ), [q]);
  const guides = useMemo(() => (q ? GUIDES.filter((g) => `${g.title} ${g.steps.join(" ")}`.toLowerCase().includes(q)) : GUIDES), [q]);
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className={`${ui.page} ${styles.page}`}>
      <div className={styles.top}>
        <h1>Help</h1>
        <div className={styles.search}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} aria-hidden="true" />
          <input type="search" className={styles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" aria-label="Search help" autoComplete="off" />
          {query && (
            <button type="button" className={styles.clear} onClick={() => setQuery("")} aria-label="Clear search">
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.contact} aria-labelledby="support-h">
          <h2 id="support-h">Contact support</h2>
          {contacts === null ? <p className={styles.muted}>Loading…</p> : !any ? <p className={styles.muted}>Support contact details are not available right now.</p> : (
            <>
              <div className={styles.contactBtns}>
                {c.whatsapp && <a className={`${styles.contactBtn} ${styles.contactMain}`} href={whatsappLink(c.whatsapp)} target="_blank" rel="noopener noreferrer"><FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" /><span>WhatsApp</span></a>}
                {c.phone && <a className={styles.contactBtn} href={telLink(c.phone)}><FontAwesomeIcon icon={faPhone} aria-hidden="true" /><span>Call us</span></a>}
                {c.email && <a className={styles.contactBtn} href={`mailto:${c.email}`}><FontAwesomeIcon icon={faEnvelope} aria-hidden="true" /><span>Email</span></a>}
              </div>
              {c.hours && <p className={styles.muted}>{c.hours}</p>}
            </>
          )}
        </section>

        <div className={styles.main}>
          {q && faq.length === 0 && guides.length === 0 && (
            <p className={styles.empty} role="status">Nothing matches “{query.trim()}”. Try another word, or contact support.</p>
          )}

          {faq.length > 0 && (
            <section className={styles.section} aria-labelledby="faq-h">
              <h2 id="faq-h">Common questions</h2>
              <div className={styles.list}>
                {faq.map((f) => (
                  <Entry key={f.q} title={f.q} open={open === `q:${f.q}`} onToggle={() => toggle(`q:${f.q}`)}>
                    <p>{f.a}</p>
                  </Entry>
                ))}
              </div>
            </section>
          )}

          {guides.length > 0 && (
            <section className={styles.section} aria-labelledby="guides-h">
              <h2 id="guides-h">How to</h2>
              <div className={styles.list}>
                {guides.map((g) => {
                  const link = GUIDE_LINKS[g.id];
                  return (
                    <Entry key={g.id} title={g.title} meta={`${g.steps.length} steps`} open={open === `g:${g.id}`} onToggle={() => toggle(`g:${g.id}`)}>
                      <ol className={styles.steps}>{g.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                      {link && <Link className={styles.go} to={link[0]}>Open {link[1]}</Link>}
                    </Entry>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
