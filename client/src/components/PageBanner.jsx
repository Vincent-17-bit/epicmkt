import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Container from "./Container.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./PageBanner.module.css";

export default function PageBanner({ icon, title, subtitle, crumbs = null, loading = false }) {
  return (
    <section className={`${styles.banner} ${crumbs ? styles.withCrumbs : ""}`}>
      <Container>
        {crumbs}
        <div className={styles.inner}>
          {icon && (
            <span className={styles.icon}>
              <FontAwesomeIcon icon={icon} />
            </span>
          )}
          <div className={styles.text}>
            {loading ? (
              <>
                <Skeleton width="min(16rem, 70%)" height="2rem" />
                <Skeleton width="min(22rem, 90%)" height="1rem" />
              </>
            ) : (
              <>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
