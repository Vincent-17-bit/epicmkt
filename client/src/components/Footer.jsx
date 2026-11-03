import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faChevronDown, faClock, faEnvelope, faLocationDot, faPhone } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { formatPhoneKE, telLink, whatsappLink } from "@epicmkt/shared";
import { site } from "../lib/site.js";
import { businessLinks, links } from "../config/nav.js";
import { t } from "../i18n/index.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { scrollToTop } from "../lib/scrollToTop.js";
import Container from "./Container.jsx";
import { Logo } from "@epicmkt/ui";
import ThemeSwitch from "./ThemeSwitch.jsx";
import styles from "./Footer.module.css";

const columns = [
  {
    area: "quick",
    titleKey: "footer.quickLinks",
    links: [
      { to: "/", labelKey: "footer.home" },
      { to: "/#categories", labelKey: "footer.categories" },
      { to: "/search", labelKey: "footer.browseAll" },
      links.about
    ]
  },
  {
    area: "business",
    titleKey: "footer.forBusinesses",
    links: businessLinks
  },
  {
    area: "help",
    titleKey: "footer.help",
    links: [
      links.faq,
      { to: links.about.to, labelKey: "footer.howItWorks" },
      { to: links.contact.to, labelKey: "footer.reportProblem" },
      { to: links.contact.to, labelKey: "footer.suggestBusiness" }
    ]
  },
  {
    area: "legal",
    titleKey: "footer.legal",
    links: [
      { to: "/privacy", labelKey: "footer.privacy" },
      { to: "/terms", labelKey: "footer.terms" },
      { to: "/cookies", labelKey: "footer.cookies" }
    ]
  }
];

const contactRows = [
  site.phone && { key: "phone", icon: faPhone, label: formatPhoneKE(site.phone), href: telLink(site.phone) },
  site.whatsapp && { key: "whatsapp", icon: faWhatsapp, label: `${t("footer.whatsapp")} ${formatPhoneKE(site.whatsapp)}`, href: whatsappLink(site.whatsapp), external: true },
  site.email && { key: "email", icon: faEnvelope, label: site.email, href: `mailto:${site.email}` },
  site.town && { key: "town", icon: faLocationDot, label: site.town },
  site.supportHours && { key: "hours", icon: faClock, label: `${t("footer.support")} ${site.supportHours}` }
].filter(Boolean);

// Below this width the link groups collapse into an accordion.
const WIDE = "(min-width: 40rem)";

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

export default function Footer() {
  const desktop = useMediaQuery(WIDE);

  return (
    <footer className={styles.footer} data-theme="light">
      <button type="button" className={styles.topBar} onClick={scrollToTop}>
        <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
        {t("footer.backToTop")}
      </button>

      <Container className={styles.top}>
        <div className={`${styles.brand} ${styles.about}`}>
          <Logo tagline={t("footer.tagline")} />
          <p className={styles.aboutText}>{t("footer.about")}</p>
          {site.socials.length > 0 && (
            <ul className={styles.socials} aria-label={t("footer.follow")}>
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

        <Section id="footer-contact" title={t("footer.contact")} area="contact" desktop={desktop}>
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
              <Link to={links.contact.to} className={styles.rowLink}>
                {t("footer.contactPage")}
              </Link>
            </li>
          </ul>
        </Section>

        {columns.map((col) => (
          <Section key={col.area} id={`footer-${col.area}`} title={t(col.titleKey)} area={col.area} desktop={desktop}>
            <ul className={styles.links}>
              {col.links.map((link) => (
                <li key={link.labelKey}>
                  <Link to={link.to} className={styles.link}>
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </Container>

      <Container>
        <div className={styles.bottom}>
          <p className={styles.note}>{t("footer.note")}</p>
          <ThemeSwitch className={styles.theme} />
          <small className={styles.copy}>&copy; {new Date().getFullYear()} EpicMKT. {t("footer.rights")}</small>
        </div>
      </Container>
    </footer>
  );
}
