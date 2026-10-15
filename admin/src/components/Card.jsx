import { createElement, useId } from "react";
import { cx } from "./cx.js";
import styles from "./Card.module.css";

/**
 * A surface with an optional header (title, description, actions) and footer.
 * as: the element to render ("section" by default; use "a" or "button" for a whole-card control).
 * With a title and as="section" the card is labelled by it, so it shows up as a landmark region.
 * padding: none | sm | md | lg     interactive: lifts on hover (hover devices only)
 */
export function Card({ as = "section", title, description, actions, footer, padding = "md", interactive = false, headingLevel = 3, className, children, ...rest }) {
  const titleId = useId();
  const hasHeader = title || description || actions;
  const labelled = title && as === "section" ? { "aria-labelledby": titleId } : {};
  return createElement(
    as,
    { className: cx(styles.card, styles[`pad-${padding}`], interactive && styles.interactive, className), ...labelled, ...rest },
    hasHeader ? (
      <header className={styles.header}>
        <div className={styles.heading}>
          {title ? createElement(`h${headingLevel}`, { id: titleId, className: styles.title }, title) : null}
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
    ) : null,
    children != null ? <div className={styles.body}>{children}</div> : null,
    footer ? <footer className={styles.footer}>{footer}</footer> : null,
  );
}
