import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/ui.jsx";
import { useCatalog } from "./useCatalog.js";
import { FirstItemForm } from "./FirstItemForm.jsx";
import { ItemTable } from "./ItemTable.jsx";
import { NeedsAttention, attentionList } from "./NeedsAttention.jsx";
import { History } from "./History.jsx";
import { SectionsDialog } from "./SectionsDialog.jsx";
import { UnsavedGuard } from "./UnsavedGuard.jsx";
import { UsageMeter, UpgradePrompt } from "./Usage.jsx";
import styles from "./catalog.module.css";

const TABS = [
  { id: "table", label: "Table" },
  { id: "attention", label: "Needs attention" },
  { id: "history", label: "History" },
];

const SAVE_TEXT = { saved: "All changes saved", saving: "Saving…", error: "Some changes could not be saved" };

export function CatalogPage() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const tabRefs = useRef({});
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "table";
  const attention = useMemo(() => attentionList(catalog.rows, new Map()).length, [catalog.rows]);

  if (catalog.loading) return <p className={styles.loading} role="status">Loading your catalog…</p>;
  if (catalog.error) {
    return (
      <div className={styles.empty} role="alert">
        <h2>We could not load your catalog</h2>
        <p className={styles.muted}>Check your connection and try again.</p>
        <Button variant="primary" onClick={catalog.reload}>Try again</Button>
      </div>
    );
  }

  const go = (id) => setParams(id === "table" ? {} : { tab: id }, { replace: true });
  const onTabKey = (e, i) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length];
    go(next.id);
    tabRefs.current[next.id]?.focus();
  };
  const fix = (id) => { go("table"); catalog.setFocusRequest({ id, field: "name", n: Date.now() }); };

  if (catalog.rows.length === 0) {
    return (
      <>
        <UnsavedGuard when={false} flush={catalog.flushAll} />
        <FirstItemForm catalog={catalog} />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <UnsavedGuard when={catalog.hasUnsaved} flush={catalog.flushAll} />
      <header className={styles.pageHead}>
        <div>
          <h1>Catalog</h1>
          <p className={`${styles.saveState} ${catalog.status === "error" ? styles.saveError : ""}`} role="status" aria-live="polite" data-state={catalog.status}>
            {SAVE_TEXT[catalog.status]}
          </p>
        </div>
        <UsageMeter usage={catalog.usage} />
        <Button onClick={() => setSectionsOpen(true)}>Sections</Button>
      </header>

      {(catalog.limitHit || catalog.usage.atLimit) && <UpgradePrompt usage={catalog.usage} planKey={catalog.ctx.business.planKey} onDismiss={catalog.limitHit ? catalog.dismissLimit : undefined} />}

      <div role="tablist" aria-label="Catalog views" className={styles.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            onClick={() => go(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
            {t.id === "attention" && attention > 0 && <span className={styles.tabCount}>{attention}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.tabPanel}>
        {tab === "table" && <ItemTable catalog={catalog} />}
        {tab === "attention" && <NeedsAttention catalog={catalog} onFix={fix} />}
        {tab === "history" && <History catalog={catalog} />}
      </div>

      <SectionsDialog open={sectionsOpen} onClose={() => setSectionsOpen(false)} catalog={catalog} />
    </div>
  );
}
