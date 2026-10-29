import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faFilePdf, faPhone } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { formatPhoneKE, telLink, whatsappLink } from "@epicmkt/shared";
import InfoPage from "../components/InfoPage.jsx";
import Button from "../components/Button.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Contact.module.css";

const email = import.meta.env.VITE_CONTACT_EMAIL;
const phone = import.meta.env.VITE_CONTACT_PHONE;
const whatsapp = import.meta.env.VITE_CONTACT_WHATSAPP;

// Ready-made messages the rest of the site can link to with /contact?topic=<key>.
const TOPICS = {
  plans: {
    subject: "Pricing PDF request",
    note: "Hello EpicMKT support, I need to get the PDF for pricing on the listings.",
    title: "Get the plans PDF",
    intro: "Ask EpicMKT support for the PDF with the plans and prices for every type of business."
  }
};

const buildChannels = (message, requesting) =>
  [
    email && {
      key: "email",
      label: requesting ? "Send by email" : email,
      href: message ? `mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.note)}` : `mailto:${email}`,
      icon: faEnvelope
    },
    phone && { key: "phone", label: requesting ? `Call ${formatPhoneKE(phone)}` : formatPhoneKE(phone), href: telLink(phone), icon: faPhone },
    whatsapp && {
      key: "whatsapp",
      label: requesting ? "Send on WhatsApp" : "Chat on WhatsApp",
      href: whatsappLink(whatsapp, message?.note),
      icon: faWhatsapp,
      external: true
    }
  ].filter(Boolean);

export default function Contact() {
  usePageTitle("Contact");
  const [params] = useSearchParams();
  const suggestion = (params.get("suggest") ?? "").trim().slice(0, 60);
  const topicKey = params.get("topic") ?? "";
  const topic = !suggestion && Object.prototype.hasOwnProperty.call(TOPICS, topicKey) ? TOPICS[topicKey] : null;
  const message = suggestion ? { subject: "Listing suggestion", note: `Please add "${suggestion}" to EpicMKT.` } : topic;
  const channels = buildChannels(message, Boolean(topic));
  // WhatsApp leads on the request card: it is how most visitors will reach us and the message is already written.
  const ordered = topic ? [...channels].sort((x, y) => Number(y.key === "whatsapp") - Number(x.key === "whatsapp")) : channels;
  const buttons = ordered.length ? (
    <div className={styles.channels}>
      {ordered.map((channel, index) => (
        <Button
          key={channel.key}
          as="a"
          href={channel.href}
          icon={channel.icon}
          size={topic ? "lg" : undefined}
          variant={(topic ? index === 0 : channel.key === "email") ? "primary" : "secondary"}
          {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {channel.label}
        </Button>
      ))}
    </div>
  ) : (
    <p>Contact details are not available right now. Please check back soon.</p>
  );

  if (topic) {
    return (
      <InfoPage title={topic.title} intro={topic.intro}>
        <section className={styles.request} aria-labelledby="request-title">
          <span className={styles.requestIcon}>
            <FontAwesomeIcon icon={faFilePdf} />
          </span>
          <h2 id="request-title" className={styles.requestTitle}>
            Your message is ready
          </h2>
          <p className={styles.requestHint}>Choose how you want to send it. We fill it in for you, so you only need to tap send.</p>
          <blockquote className={styles.bubble}>{topic.note}</blockquote>
          {buttons}
        </section>
      </InfoPage>
    );
  }

  return (
    <InfoPage
      title="Contact us"
      intro="Questions about a listing, feedback, or want your business listed? Get in touch with the EpicMKT team."
    >
      {suggestion && <p>Suggesting &ldquo;{suggestion}&rdquo;. Send it to us by email or WhatsApp and we will look into it.</p>}
      {buttons}
    </InfoPage>
  );
}
