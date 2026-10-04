const BUDGET = 3;
const visible = new Map();
let observer = null;
let hidden = typeof document !== "undefined" && document.hidden;

function recompute() {
  const ordered = [...visible.entries()]
    .map(([el, entry]) => ({ entry, rect: el.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  ordered.forEach(({ entry }, index) => entry.setAnimate(!hidden && index < BUDGET));
}

function ensure() {
  if (observer || typeof IntersectionObserver === "undefined") return;
  observer = new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const entry = watched.get(change.target);
        if (!entry) continue;
        if (change.isIntersecting) {
          visible.set(change.target, entry);
          if (!entry.revealed) {
            entry.revealed = true;
            entry.setRevealed(true);
          }
        } else {
          visible.delete(change.target);
          entry.setAnimate(false);
        }
      }
      recompute();
    },
    { threshold: 0.15 }
  );
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    recompute();
  });
}

const watched = new WeakMap();

export function watchCard(el, setRevealed, setAnimate) {
  if (typeof IntersectionObserver === "undefined") {
    setRevealed(true);
    return () => {};
  }
  ensure();
  watched.set(el, { setRevealed, setAnimate, revealed: false });
  observer.observe(el);
  return () => {
    observer.unobserve(el);
    visible.delete(el);
    watched.delete(el);
    recompute();
  };
}
