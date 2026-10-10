import { useMemo, useRef, useState } from "react";
import { blankItem, defaultKindFor, pricePreview } from "@epicmkt/shared";
import { Button } from "../ui/ui.jsx";
import { ItemFields, itemSections } from "./ItemFields.jsx";
import { UpgradePrompt } from "./Usage.jsx";
import { validateItem } from "./schema.js";
import { useToasts } from "../ui/toasts.js";
import styles from "./catalog.module.css";

// Full-page guided form for the very first item. Strict validation: price, season and stock must be complete.
export function FirstItemForm({ catalog }) {
  const { ctx, sections, units, addSection, createFirst, usage } = catalog;
  const [item, setItem] = useState(() => blankItem({ kind: defaultKindFor(ctx.category.id) }));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [limit, setLimit] = useState(false);
  const rootRef = useRef(null);
  const push = useToasts((s) => s.push);

  const { errors } = useMemo(() => validateItem(item, { fields: ctx.category.itemFields, strict: true }), [item, ctx]);
  const shown = attempted ? errors : {};
  const count = Object.keys(shown).length;
  const nav = itemSections(item, ctx.category);
  const preview = pricePreview(item);

  const submit = async () => {
    setAttempted(true);
    setProblem("");
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => {
        const bad = rootRef.current?.querySelector('[aria-invalid="true"]');
        bad?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        bad?.focus?.();
      });
      return;
    }
    setSaving(true);
    try {
      await createFirst(item);
      push({ message: `“${item.name.trim()}” is saved. Add more items in the table.`, ms: 6000 });
    } catch (e) {
      if (e?.code === "item_limit_reached") setLimit(true);
      else setProblem(e?.code === "invalid_value" ? e.message : "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.first} ref={rootRef}>
      <header className={styles.firstHead}>
        <h2>Add your first item</h2>
        <p className={styles.muted}>
          Start with one thing you sell or offer. After this one, you can add the rest quickly in a table.
        </p>
      </header>

      <nav aria-label="Jump to a section" className={styles.jump}>
        {nav.map((s, i) => (
          <a key={s.id} href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }}>
            <span aria-hidden="true">{i + 1}</span> {s.title}
          </a>
        ))}
      </nav>

      {limit && <UpgradePrompt usage={usage} planKey={ctx.business.planKey} onDismiss={() => setLimit(false)} />}
      {attempted && count > 0 && (
        <p className={styles.summary} role="alert">
          {count === 1 ? "1 thing needs fixing before you can save." : `${count} things need fixing before you can save.`}
        </p>
      )}

      <ItemFields item={item} onChange={(patch) => setItem((x) => ({ ...x, ...patch }))} errors={shown} ctx={{ category: ctx.category, sections, units, addSection }} />

      <div className={styles.stickyBar}>
        <div className={styles.previewLine} aria-live="polite">
          {item.name.trim() ? <strong>{item.name.trim()}</strong> : <span className={styles.muted}>Your item</span>}
          {preview && <span> · {preview}</span>}
        </div>
        {problem && <span className={styles.errorText} role="alert">{problem}</span>}
        <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save and continue"}</Button>
      </div>
    </div>
  );
}
