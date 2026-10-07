import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Container from "../components/Container.jsx";
import styles from "./BusinessHero.module.css";

export default function BusinessHero({ name, categoryName, area, county, tagline, coverUrl, logoUrl, icon }) {
  return (
    <header className={styles.hero}>
      <div className={styles.cover}>
        {coverUrl ? <img src={coverUrl} alt="" className={styles.coverImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
      </div>
      <Container className={styles.heroInner}>
        <span className={styles.logo}>
          {logoUrl ? <img src={logoUrl} alt={`${name} logo`} className={styles.logoImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
        </span>
        <div className={styles.titles}>
          <h1 className={styles.name}>{name}</h1>
          <p className={styles.where}>
            {categoryName} · {area}, {county}
          </p>
          {tagline && <p className={styles.tagline}>{tagline}</p>}
        </div>
      </Container>
    </header>
  );
}
