import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import Container from "./Container.jsx";
import PageBreadcrumbs from "./PageBreadcrumbs.jsx";
import styles from "./LegalPage.module.css";

const DOCS = [
  { to: "/terms", label: "Terms of Service", blurb: "The rules for using EpicMKT." },
  { to: "/privacy", label: "Privacy Policy", blurb: "How we handle personal data." },
  { to: "/cookies", label: "Cookie notice", blurb: "What we store on your device." }
];

const LEGAL_CONTACT = {
  title: "Questions about this document?",
  text: "Our team will respond to legal, privacy and data requests through the contact page.",
  label: "Contact EpicMKT",
  to: "/contact"
};

/** The blue "need to talk to us?" block that closes a document. */
export function ContactCard({ title, text, label, to, id = "legal-contact-title" }) {
  return (
    <aside className={styles.contact} aria-labelledby={id}>
      <h2 id={id} className={styles.contactTitle}>
        {title}
      </h2>
      <p>{text}</p>
      <Link to={to} className={styles.contactLink}>
        {label} <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </Link>
    </aside>
  );
}

/** Cards that lead to the related pages. docs: [{ to, label, blurb }] */
export function SiblingLinks({ docs, label = "Other legal documents" }) {
  if (!docs.length) return null;
  return (
    <nav className={styles.siblings} aria-label={label}>
      {docs.map((d) => (
        <Link key={d.to} to={d.to} className={styles.sibling}>
          <span>
            <span className={styles.siblingTitle}>{d.label}</span>
            <span className={styles.siblingText}>{d.blurb}</span>
          </span>
          <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

/**
 * Shared layout for the legal pages and the seller guide: a header with the key points, a sticky contents list,
 * numbered sections and links to related pages.
 *
 * sections: [{ id, title, body: ReactNode }]
 * contact:  { title, text, label, to } for the closing block (defaults to the legal contact block)
 * related:  { label, docs } for the links under it (defaults to the other legal documents)
 * children: anything that should close the page, after the links
 */
export default function LegalPage({ title, eyebrow, intro, highlights = [], sections, current, contact = LEGAL_CONTACT, related, children }) {
  const relatedDocs = related?.docs ?? DOCS.filter((d) => d.label !== current);
  const relatedLabel = related?.label ?? "Other legal documents";
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = sections.map((s) => document.getElementById(s.id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [sections]);

  const jump = (event, id) => {
    const node = document.getElementById(id);
    if (!node) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    node.focus({ preventScroll: true });
    setActive(id);
  };

  return (
    <Container className={styles.page}>
      <PageBreadcrumbs />

      <header className={styles.hero}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        {highlights.length > 0 && (
          <ul className={styles.highlights} aria-label="In brief">
            {highlights.map((h) => (
              <li key={h.title} className={styles.highlight}>
                <span className={styles.highlightTitle}>{h.title}</span>
                <span className={styles.highlightText}>{h.text}</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="On this page">
          <p className={styles.tocTitle}>On this page</p>
          <ol className={styles.tocList}>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`${styles.tocLink} ${active === s.id ? styles.tocActive : ""}`}
                  aria-current={active === s.id ? "location" : undefined}
                  onClick={(e) => jump(e, s.id)}
                >
                  <span className={styles.tocNum}>{i + 1}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className={styles.doc}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} tabIndex={-1} className={styles.clause} aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className={styles.clauseTitle}>
                <span className={styles.clauseNum} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </h2>
              <div className={styles.clauseBody}>{s.body}</div>
            </section>
          ))}

          <ContactCard {...contact} />

          <SiblingLinks docs={relatedDocs} label={relatedLabel} />

          {children}
        </article>
      </div>
    </Container>
  );
}
