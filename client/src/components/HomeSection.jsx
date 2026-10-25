import Container from "./Container.jsx";
import styles from "./HomeSection.module.css";

/** One band of the home page. Every band uses this spacing, so the gaps between sections are the same all the way down. */
export default function HomeSection({ labelledBy, children }) {
  return (
    <section className={styles.section} aria-labelledby={labelledBy}>
      <Container>{children}</Container>
    </section>
  );
}
