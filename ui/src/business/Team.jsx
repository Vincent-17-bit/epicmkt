import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { socialsList } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import BusinessSection from "./BusinessSection.jsx";
import { SOCIAL_ICONS } from "./socialIcons.js";
import styles from "./Team.module.css";

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const external = { target: "_blank", rel: "noopener noreferrer" };

// A row of round icon links to a person's own profiles. Each one opens that profile in a new tab. The list is re-checked here
// (socialsList only keeps clean canonical addresses on the five known networks), so a bad stored value is simply not drawn.
// In a seller's preview the links are shown but do nothing, like every other action in the preview.
export function SocialLinks({ name, socials, mode = "live", className = "" }) {
  const list = socialsList(socials);
  if (!list.length) return null;
  const act = actionProps(isPreview(mode));
  return (
    <ul className={`${styles.socials} ${className}`} aria-label={`${name} on social media`}>
      {list.map((s) => (
        <li key={s.key}>
          <a className={styles.social} data-network={s.key} aria-label={`${name} on ${s.label}`} title={`${s.label}: ${s.handle}`} {...act.link(s.url, undefined, external)}>
            <FontAwesomeIcon icon={SOCIAL_ICONS[s.key]} fixedWidth />
          </a>
        </li>
      ))}
    </ul>
  );
}

// The people customers will meet. Services are listed only when the shop links them (Premium).
export default function Team({ team, mode = "live" }) {
  if (!team?.length) return null;
  return (
    <BusinessSection title="Our team" id="team">
      <ul className={styles.list}>
        {team.map((m) => (
          <li key={m.id} className={styles.card}>
            {m.photoUrl ? <img className={styles.avatar} src={m.photoUrl} alt="" loading="lazy" /> : <span className={styles.initials} aria-hidden="true">{initials(m.name)}</span>}
            <div className={styles.text}>
              <h3 className={styles.name}>{m.name}</h3>
              {m.role && <p className={styles.meta}>{m.role}</p>}
              {m.specialties.length > 0 && <p className={styles.meta}>{m.specialties.join(" · ")}</p>}
              {m.services?.length > 0 && <p className={styles.meta}>Does: {m.services.join(", ")}</p>}
              <SocialLinks name={m.name} socials={m.socials} mode={mode} />
            </div>
          </li>
        ))}
      </ul>
    </BusinessSection>
  );
}
