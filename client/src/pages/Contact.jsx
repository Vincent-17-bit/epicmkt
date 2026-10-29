import { useSearchParams } from "react-router-dom";
import { faEnvelope, faPhone } from "@fortawesome/free-solid-svg-icons";
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
    subject: "Plans PDF request",
    note: "Hello EpicMKT, please send me the plans PDF.",
    lead: "Ask the EpicMKT admin for the plans PDF. Choose how you want to reach us and your message is ready to send."
  }
};

const buildChannels = (message) =>
  [
    email && {
      key: "email",
      label: email,
      href: message ? `mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.note)}` : `mailto:${email}`,
      icon: faEnvelope
    },
    phone && { key: "phone", label: formatPhoneKE(phone), href: telLink(phone), icon: faPhone },
    whatsapp && {
      key: "whatsapp",
      label: "Chat on WhatsApp",
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
  const channels = buildChannels(message);
  return (
    <InfoPage
      title="Contact us"
      intro="Questions about a listing, feedback, or want your business listed? Get in touch with the EpicMKT team."
    >
      {suggestion && <p>Suggesting &ldquo;{suggestion}&rdquo;. Send it to us by email or WhatsApp and we will look into it.</p>}
      {topic && <p>{topic.lead}</p>}
      {channels.length ? (
        <div className={styles.channels}>
          {channels.map((channel) => (
            <Button
              key={channel.key}
              as="a"
              href={channel.href}
              icon={channel.icon}
              variant={channel.key === "email" ? "primary" : "secondary"}
              {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {channel.label}
            </Button>
          ))}
        </div>
      ) : (
        <p>Contact details are not available right now. Please check back soon.</p>
      )}
    </InfoPage>
  );
}
