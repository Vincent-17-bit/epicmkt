import { useEffect } from "react";

function label(table) {
  if (table.closest(".dt")) return;
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!head) return;
  table.dataset.cards = "";
  const names = [...head.cells].map((th) => (th.querySelector(".sr-only") ? "" : th.textContent.trim()));
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      [...row.cells].forEach((td, i) => {
        if (td.colSpan > 1) return;
        const name = names[i] || "";
        if (td.dataset.label !== name) td.dataset.label = name;
      });
    }
  }
}

export default function useTableLabels(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const run = () => root.querySelectorAll("table").forEach(label);
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
}
