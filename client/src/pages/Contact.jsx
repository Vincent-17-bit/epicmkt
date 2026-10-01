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

const channels = [
  email && { key: "email", label: email, href: `mailto:${email}`, icon: faEnvelope },
  phone && { key: "phone", label: formatPhoneKE(phone), href: telLink(phone), icon: faPhone },
  whatsapp && { key: "whatsapp", label: "Chat on WhatsApp", href: whatsappLink(whatsapp), icon: faWhatsapp, external: true }
].filter(Boolean);

export default function Contact() {
  usePageTitle("Contact");
  return (
    <InfoPage
      title="Contact us"
      intro="Questions about a listing, feedback, or want your business listed? Get in touch with the EpicMKT team."
    >
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
