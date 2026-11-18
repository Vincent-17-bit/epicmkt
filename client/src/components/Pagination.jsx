import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import styles from "./Pagination.module.css";

// One pager for every long list (the home products and product search): Previous, the page numbers, Next, in one bordered bar,
// the page you are on boxed. Few pages: every number. Many: 1 2 3 … last, with the current page and its neighbours.
const FITS_WIDE = 8;
const FITS_NARROW = 5;

/** The cells to draw for `pages` pages around `focus`: page numbers, and a `gap-N` string where numbers are skipped. */
export function pageItems(focus, pages, { narrow = false } = {}) {
  const all = Array.from({ length: pages }, (_, i) => i + 1);
  const want = pages <= (narrow ? FITS_NARROW : FITS_WIDE) ? all : narrow ? [1, focus - 1, focus, focus + 1, pages] : [1, 2, 3, focus - 1, focus, focus + 1, pages];
  const nums = [...new Set(want)].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    const before = nums[i - 1];
    // Skipping exactly one number would draw "…" where the number itself fits, so draw the number.
    if (i > 0 && n - before === 2) out.push(before + 1);
    else if (i > 0 && n - before > 2) out.push(`gap-${n}`);
    out.push(n);
  });
  return out;
}

/**
 * `page` is the first page on screen and `to` the last (the home grid adds pages below the first, so several can be on screen at
 * once); every page from `page` to `to` is marked. Previous goes before `page`, Next after `to`.
 */
export default function Pagination({ pages, page, to = page, onPage, label = "Pages", className = "" }) {
  const narrow = useMediaQuery("(max-width: 30rem)");
  if (pages < 2) return null;
  const items = pageItems(to, pages, { narrow });
  return (
    <nav className={`${styles.pager} ${className}`.trim()} aria-label={label}>
      <button type="button" className={styles.nav} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
        <span className={styles.navText}>Previous</span>
      </button>
      {items.map((n) =>
        typeof n === "string" ? (
          <span key={n} className={styles.gap} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={n >= page && n <= to ? styles.on : styles.num}
            aria-current={n >= page && n <= to ? "page" : undefined}
            aria-label={`Page ${n}`}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        )
      )}
      <button type="button" className={styles.nav} disabled={to >= pages} onClick={() => onPage(to + 1)} aria-label="Next page">
        <span className={styles.navText}>Next</span>
        <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
      </button>
    </nav>
  );
}
