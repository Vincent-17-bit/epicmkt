import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Container from "../components/Container.jsx";
import styles from "./BusinessPage.module.css";

export default function BusinessHero({ business, icon }) {
  return (
    <header className={styles.hero}>
      <div className={styles.cover}>
        {business.coverUrl ? <img src={business.coverUrl} alt="" className={styles.coverImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
      </div>
      <Container className={styles.heroInner}>
        <span className={styles.logo}>
          {business.logoUrl ? <img src={business.logoUrl} alt={`${business.name} logo`} className={styles.logoImg} decoding="async" /> : <FontAwesomeIcon icon={icon} />}
        </span>
        <div className={styles.titles}>
          <h1 className={styles.name}>{business.name}</h1>
          <p className={styles.where}>
            {business.category?.singular} · {business.area}, {business.county}
          </p>
          {business.tagline && <p className={styles.tagline}>{business.tagline}</p>}
        </div>
      </Container>
    </header>
  );
}
