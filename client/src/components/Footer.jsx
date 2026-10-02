import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faChevronDown, faClock, faEnvelope, faLocationDot, faPhone } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { formatPhoneKE, telLink, whatsappLink } from "@epicmkt/shared";
import { site } from "../lib/site.js";
import Container from "./Container.jsx";
import Logo from "./Logo.jsx";
import ThemeSwitch from "./ThemeSwitch.jsx";
import styles from "./Footer.module.css";

const columns = [
  {
    area: "quick",
    title: "Quick links",
    links: [
      { to: "/", label: "Home" },
      { to: "/#categories", label: "Categories" },
      { to: "/search", label: "Browse all businesses" },
      { to: "/about", label: "About" }
    ]
  },
  {
    area: "business",
    title: "For businesses",
    links: [
      { to: "/sell", label: "Become a seller" },
      { to: "/sell#plans", label: "Pricing" },
      { to: "/sell#how", label: "Seller guide" }
    ]
  },
  {
    area: "help",
    title: "Help",
    links: [
      { to: "/faq", label: "FAQs" },
      { to: "/about", label: "How it works" },
      { to: "/contact", label: "Report a problem" },
      { to: "/contact", label: "Suggest a business" }
    ]
  },
  {
    area: "legal",
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/terms", label: "Terms of Service" },
      { to: "/cookies", label: "Cookie notice" }
    ]
  }
];

const contactRows = [
  site.phone && { key: "phone", icon: faPhone, label: formatPhoneKE(site.phone), href: telLink(site.phone) },
  site.whatsapp && { key: "whatsapp", icon: faWhatsapp, label: `WhatsApp ${formatPhoneKE(site.whatsapp)}`, href: whatsappLink(site.whatsapp), external: true },
  site.email && { key: "email", icon: faEnvelope, label: site.email, href: `mailto:${site.email}` },
  site.town && { key: "town", icon: faLocationDot, label: site.town },
  site.supportHours && { key: "hours", icon: faClock, label: `Support: ${site.supportHours}` }
].filter(Boolean);

const DESKTOP = "(min-width: 48rem)";

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const sync = () => setDesktop(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return desktop;
}

function Section({ id, title, area, desktop, children }) {
  const [open, setOpen] = useState(false);
  const expanded = desktop || open;
  return (
    <section className={`${styles.section} ${styles[area]}`} aria-labelledby={`${id}-title`}>
      {desktop ? (
        <h2 id={`${id}-title`} className={styles.heading}>
          {title}
        </h2>
      ) : (
        <h2 id={`${id}-title`} className={styles.heading}>
          <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
            <span>{title}</span>
            <FontAwesomeIcon icon={faChevronDown} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true" />
          </button>
        </h2>
      )}
      <div id={`${id}-panel`} className={`${styles.panel} ${expanded ? styles.panelOpen : ""}`}>
        <div className={styles.clip}>{children}</div>
      </div>
    </section>
  );
}

function Language() {
  const [note, setNote] = useState(false);
  return (
    <div className={styles.lang}>
      <div role="group" aria-label="Language" className={styles.langGroup}>
        <button type="button" className={styles.langBtn} aria-pressed="true">
          English
        </button>
        <button type="button" className={styles.langBtn} aria-pressed="false" onClick={() => setNote(true)}>
          Kiswahili
        </button>
      </div>
      <p className={styles.langNote} role="status">
        {note ? "Kiswahili is coming soon." : ""}
      </p>
    </div>
  );
}

export default function Footer() {
  const desktop = useDesktop();
  const toTop = () => {
    const main = document.getElementById("main");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    main?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    main?.focus({ preventScroll: true });
  };

  return (
    <footer className={styles.footer} data-theme="light">
      <Container className={styles.top}>
        <div className={`${styles.brand} ${styles.about}`}>
          <Logo />
          <p className={styles.aboutText}>
            EpicMKT is a directory of local businesses across Kenya. Find what you need nearby, then call, WhatsApp or get directions in one tap.
          </p>
          {site.socials.length > 0 && (
            <ul className={styles.socials} aria-label="Follow EpicMKT">
              {site.socials.map((s) => (
                <li key={s.key}>
                  <a href={s.href} className={styles.social} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
                    <FontAwesomeIcon icon={s.icon} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Section id="footer-contact" title="Contact" area="contact" desktop={desktop}>
          <ul className={styles.rows}>
            {contactRows.map((row) => (
              <li key={row.key} className={styles.row}>
                <FontAwesomeIcon icon={row.icon} className={styles.rowIcon} aria-hidden="true" />
                {row.href ? (
                  <a href={row.href} className={styles.rowLink} {...(row.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {row.label}
                  </a>
                ) : (
                  <span>{row.label}</span>
                )}
              </li>
            ))}
            <li className={styles.row}>
              <FontAwesomeIcon icon={faEnvelope} className={styles.rowIcon} aria-hidden="true" />
              <Link to="/contact" className={styles.rowLink}>
                Contact page
              </Link>
            </li>
          </ul>
        </Section>

        {columns.map((col) => (
          <Section key={col.title} id={`footer-${col.area}`} title={col.title} area={col.area} desktop={desktop}>
            <ul className={styles.links}>
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </Container>

      <Container className={styles.bottom}>
        <p className={styles.note}>EpicMKT lists businesses and does not process orders or payments.</p>
        <div className={styles.controls}>
          <Language />
          <ThemeSwitch />
          <button type="button" className={styles.top_btn} onClick={toTop}>
            <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
            Back to top
          </button>
        </div>
        <small className={styles.copy}>&copy; {new Date().getFullYear()} EpicMKT. All rights reserved.</small>
      </Container>
    </footer>
  );
}
