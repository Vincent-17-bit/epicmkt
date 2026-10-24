import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, telLink, whatsappLink } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import styles from "./StoreActions.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

const DEFAULT_LABELS = { call: "Call", whatsapp: "WhatsApp", directions: "Directions" };

const hasText = (value) => String(value ?? "").trim().length > 0;
const hasPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng);

/**
 * Call, WhatsApp and Directions as one row at the foot of a store card. The row measures itself: with room for words
 * each button stacks its icon over its label, and in a narrow card the labels give way to the icons alone (every
 * button keeps its full accessible name). A store missing a phone, WhatsApp number or map point simply shows fewer
 * buttons instead of a dead one.
 */
export default function StoreActions({ business, onContact, mode = "live", labels = DEFAULT_LABELS, className = "" }) {
  const act = actionProps(isPreview(mode));
  const track = (type) => () => onContact?.(business, type);
  const name = business.name;

  const actions = [
    hasText(business.phone) && {
      key: "call",
      icon: faPhone,
      label: labels.call,
      aria: `${labels.call} ${name}`,
      primary: true,
      props: act.link(telLink(business.phone), track("call"))
    },
    hasText(business.whatsapp) && {
      key: "whatsapp",
      icon: faWhatsapp,
      label: labels.whatsapp,
      aria: `${labels.whatsapp} ${name}`,
      props: act.link(whatsappLink(business.whatsapp, `Hi ${name}, I found you on EpicMKT.`), track("whatsapp"), external)
    },
    hasPoint(business.lat, business.lng) && {
      key: "directions",
      icon: faLocationArrow,
      label: labels.directions,
      aria: `${labels.directions} to ${name}`,
      props: act.link(directionsLink(business.lat, business.lng), track("directions"), external)
    }
  ].filter(Boolean);

  if (actions.length === 0) return null;

  return (
    <div className={`${styles.bar} ${className}`} role="group" aria-label={`Contact ${name}`}>
      <div className={styles.row} style={{ "--count": actions.length }}>
        {actions.map((action) => (
          <a
            key={action.key}
            className={`${styles.action} ${action.primary ? styles.primary : styles.secondary}`}
            aria-label={action.aria}
            {...action.props}
          >
            <FontAwesomeIcon icon={action.icon} className={styles.icon} aria-hidden="true" />
            <span className={styles.label} aria-hidden="true">
              {action.label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
