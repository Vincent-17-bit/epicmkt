import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatKes } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

/**
 * A dearer category: pay the prorated difference now. A cheaper one: nothing now, the new price starts at the
 * next renewal. Both wait for an admin to approve; until then the request shows as pending.
 */
export default function CategoryChange({ business, payments, onPay }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = useQuery({ queryKey: ["category-plans"], queryFn: api.listCategoryPlans });
  const changes = useQuery({ queryKey: ["changes"], queryFn: api.listChanges });
  const pending = (changes.data ?? []).find((c) => c.field === "category_id" && c.status === "pending");
  const nameOf = (id) => cats.data?.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    setQuote(null);
    setError("");
    if (!target) return undefined;
    let live = true;
    api.quoteCategoryChange(target).then((q) => live && setQuote(q)).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [target]);

  const request = async () => {
    setBusy(true);
    setError("");
    try {
      await api.requestChange("category_id", target);
      setTarget("");
      await qc.invalidateQueries({ queryKey: ["changes"] });
      qc.invalidateQueries({ queryKey: ["shop-preview"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancelChange(pending.id);
      await qc.invalidateQueries({ queryKey: ["changes"] });
      qc.invalidateQueries({ queryKey: ["shop-preview"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    const paid = payments.some((p) => p.kind === "category_change" && p.categoryId === pending.newValue && p.status !== "rejected");
    return (
      <section className={ui.card} aria-labelledby="cat-title" data-testid="category-pending">
        <h2 id="cat-title">Category change</h2>
        <div className={`${styles.quote}`}>
          <p><strong>Waiting for admin approval.</strong> You asked to move to {nameOf(pending.newValue)}.</p>
          {pending.extraDue > 0 ? (
            <p>{paid ? `Your ${formatKes(pending.extraDue)} payment is recorded.` : `Pay ${formatKes(pending.extraDue)} now (the prorated difference) so the request can be approved.`}</p>
          ) : (
            <p>Nothing to pay now.</p>
          )}
          <p>The new price, {formatKes(pending.newMonthlyPrice)} per month, applies from your next renewal.</p>
        </div>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {pending.extraDue > 0 && !paid && <button type="button" className={ui.btn} onClick={() => onPay({ purpose: "category_change", category: pending.newValue, changeId: pending.id })}>Pay {formatKes(pending.extraDue)}</button>}
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={cancel} disabled={busy}>Cancel request</button>
        </div>
      </section>
    );
  }

  const options = (cats.data ?? []).filter((c) => c.id !== business.categoryId && c.prices[business.planKey] != null);
  return (
    <section className={ui.card} aria-labelledby="cat-title">
      <h2 id="cat-title">Change category</h2>
      <p className={ui.muted}>Moving to a dearer category costs the prorated difference for the rest of this month. A cheaper one costs nothing now and starts at your next renewal. An admin approves every change.</p>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="new-cat">New category</label>
        <select id="new-cat" className={ui.input} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a category</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatKes(c.prices[business.planKey])} / month)</option>)}
        </select>
      </div>
      {quote && (
        <div className={styles.quote} data-testid="category-quote">
          {quote.dearer ? <p>Pay <strong>{formatKes(quote.extraDueNow)}</strong> now for the rest of this month.</p> : <p>Nothing to pay now.</p>}
          <p>{formatKes(quote.newMonthlyPrice)} per month from your next renewal.</p>
        </div>
      )}
      {error && <p className={ui.error} role="alert">{error}</p>}
      <button type="button" className={ui.btn} style={{ justifySelf: "start" }} disabled={!quote || busy} onClick={request}>Request change</button>
    </section>
  );
}
