import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { actionProps, isPreview } from "../preview.js";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./Follow.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function Follow({ socials, mode = "live" }) {
  const act = actionProps(isPreview(mode));

  return (
    <BusinessSection title="Follow" id="social">
      <ul className={styles.socials}>
        {socials.map((s) => (
          <li key={s.key}>
            <a className={styles.social} {...act.link(s.href, undefined, external)}>
              <FontAwesomeIcon icon={s.icon} />
              <span>{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </BusinessSection>
  );
}
