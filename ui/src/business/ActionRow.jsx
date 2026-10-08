import { faPhone, faLocationArrow, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import Button from "../components/Button.jsx";
import styles from "./ActionRow.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function ActionRow({ callHref, whatsappHref, directionsHref, shareNote, mode = "live", onCall, onWhatsApp, onDirections, onShare }) {
  const act = actionProps(isPreview(mode));

  return (
    <div className={styles.actions}>
      <Button as="a" icon={faPhone} {...act.link(callHref, onCall)}>
        Call
      </Button>
      <Button as="a" variant="secondary" icon={faWhatsapp} {...act.link(whatsappHref, onWhatsApp, external)}>
        WhatsApp
      </Button>
      <Button as="a" variant="secondary" icon={faLocationArrow} {...act.link(directionsHref, onDirections, external)}>
        Directions
      </Button>
      <Button variant="secondary" icon={faShareNodes} {...act.button(onShare)}>
        {shareNote || "Share"}
      </Button>
    </div>
  );
}
