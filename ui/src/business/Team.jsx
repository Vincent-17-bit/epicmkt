import BusinessSection from "./BusinessSection.jsx";
import styles from "./Team.module.css";

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

// The people customers will meet. Services are listed only when the shop links them (Premium).
export default function Team({ team }) {
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
            </div>
          </li>
        ))}
      </ul>
    </BusinessSection>
  );
}
