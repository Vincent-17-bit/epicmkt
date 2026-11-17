import { useEffect, useRef, useState } from "react";
import styles from "./SectionNav.module.css";

// The item page's sections, in page order. A section is offered only when it is on the page and has something in it.
export const SECTIONS = [
  { id: "item-overview", label: "Overview" },
  { id: "item-details", label: "Details" },
  { id: "item-specs", label: "Specifications" },
  { id: "item-delivery", label: "Delivery" },
  { id: "item-store", label: "From the store" },
  { id: "item-product-info", label: "Product information" },
  { id: "item-recommend", label: "Goes well with" },
  { id: "item-similar", label: "Similar products" }
];

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Section links that slide in while the buyer scrolls DOWN the item page and hide the moment they scroll up (C10). The current
 * section is highlighted (IntersectionObserver, no scroll maths per pixel). It sits in a zero-height sticky holder, so showing
 * and hiding it never moves the page, and it stays under the site header.
 *   scrollRef: a ref to the element that scrolls (the item sheet), or null for the window (the item page).
 */
export default function SectionNav({ scrollRef = null, itemId }) {
  const [present, setPresent] = useState([]);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(SECTIONS[0].id);
  const last = useRef(0);

  // Which sections exist for this item (they mount after the data arrives).
  useEffect(() => {
    let frame = 0;
    const scan = () => setPresent(SECTIONS.filter((s) => document.getElementById(s.id)?.offsetHeight > 0));
    frame = requestAnimationFrame(scan);
    const later = setTimeout(scan, 1200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [itemId]);

  // Down shows it (once past the top of the page), up hides it straight away. One read per animation frame at most.
  useEffect(() => {
    const scrollRoot = scrollRef?.current ?? null;
    const target = scrollRoot ?? window;
    const yOf = () => (scrollRoot ? scrollRoot.scrollTop : window.scrollY);
    let ticking = false;
    last.current = yOf();
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = yOf();
        const delta = y - last.current;
        if (y < 320) setVisible(false);
        else if (delta > 4) {
          setVisible(true);
          // Sections that load late (Recommended, Similar items) join the bar once they are on the page.
          setPresent((was) => {
            const now = SECTIONS.filter((s) => document.getElementById(s.id)?.offsetHeight > 0);
            return now.length === was.length ? was : now;
          });
        }
        else if (delta < -4) setVisible(false);
        last.current = y;
      });
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // The section in the middle band of the screen is the current one.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !present.length) return undefined;
    const scrollRoot = scrollRef?.current ?? null;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { root: scrollRoot, rootMargin: "-35% 0px -55% 0px" }
    );
    for (const s of present) {
      const node = document.getElementById(s.id);
      if (node) io.observe(node);
    }
    return () => io.disconnect();
  }, [present, scrollRef]);

  if (present.length < 2) return null;

  const go = (event, id) => {
    event.preventDefault();
    const node = document.getElementById(id);
    if (!node) return;
    node.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    setActive(id);
    // Keyboard and screen-reader users land in the section, not just near it.
    if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
    node.focus({ preventScroll: true });
  };

  return (
    <div className={styles.holder} data-sheet={scrollRef ? "" : undefined}>
      <nav className={styles.bar} data-visible={visible ? "" : undefined} aria-label="Sections of this item" aria-hidden={visible ? undefined : true} inert={visible ? undefined : ""}>
        <ul className={styles.list}>
          {present.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={styles.link} aria-current={active === s.id ? "true" : undefined} onClick={(e) => go(e, s.id)}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
