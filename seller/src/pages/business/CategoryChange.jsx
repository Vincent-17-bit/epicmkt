import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPrice, planLabel } from "@epicmkt/shared/billing";
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
            <p>{paid ? `Your ${formatPrice(pending.extraDue)} payment is recorded.` : `Pay ${formatPrice(pending.extraDue)} now (the prorated difference) so the request can be approved.`}</p>
          ) : (
            <p>Nothing to pay now.</p>
          )}
          <p>The new price, {formatPrice(pending.newMonthlyPrice)} per month, applies from your next renewal.</p>
        </div>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {pending.extraDue > 0 && !paid && <button type="button" className={ui.btn} onClick={() => onPay({ purpose: "category_change", category: pending.newValue, changeId: pending.id })}>Pay {formatPrice(pending.extraDue)}</button>}
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={cancel} disabled={busy}>Cancel request</button>
        </div>
      </section>
    );
  }

  // Every category the admin has switched on, in the admin's order and groups. The shop's own category is listed (it cannot be
  // chosen) so it is clear the list is complete; a category with no price for this shop's plan cannot be chosen either.
  const all = cats.data ?? [];
  const groups = [];
  for (const c of all) {
    const g = c.group || "Other";
    let entry = groups.find((x) => x.name === g);
    if (!entry) groups.push((entry = { name: g, list: [] }));
    entry.list.push(c);
  }
  const plan = planLabel(business.planKey);
  // The server refuses a dearer category while the subscription is not active, so say so before the seller asks.
  const renewFirst = Boolean(quote?.dearer && quote.listingState && quote.listingState !== "active");
  return (
    <section className={ui.card} aria-labelledby="cat-title">
      <h2 id="cat-title">Change category</h2>
      <p className={ui.muted}>
        Only if your shop now does a different kind of business. To keep {business.categoryName} and pay for more time, use <strong>Renew</strong> at the top of this page.
      </p>
      <p className={ui.muted}>Moving to a dearer category costs the prorated difference for the days left this month. A cheaper one costs nothing now and starts at your next renewal. An admin approves every change.</p>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="new-cat">New category (prices are for your {plan} plan)</label>
        <select id="new-cat" className={ui.input} value={target} onChange={(e) => setTarget(e.target.value)} disabled={cats.isLoading}>
          <option value="">{cats.isLoading ? "Loading categories…" : `Choose from ${all.length} categories`}</option>
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.list.map((c) => {
                const mine = c.id === business.categoryId;
                const price = c.prices?.[business.planKey];
                return (
                  <option key={c.id} value={c.id} disabled={mine || price == null}>
                    {c.name} ({mine ? "your category" : price == null ? `no ${plan} price yet` : `${formatPrice(price)} / month`})
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>
      {cats.isError && <p className={ui.error} role="alert">We could not load the categories. Check your connection and try again.</p>}
      {quote && (
        <div className={styles.quote} data-testid="category-quote">
          {renewFirst
            ? <p><strong>Renew first.</strong> A dearer category can be requested while your subscription is active. Renew at the top of this page, then come back.</p>
            : quote.extraDueNow > 0
              ? <p>Pay <strong>{formatPrice(quote.extraDueNow)}</strong> now for the days left this month.</p>
              : <p>Nothing to pay now.</p>}
          <p>{formatPrice(quote.newMonthlyPrice)} per month from your next renewal.</p>
        </div>
      )}
      {error && <p className={ui.error} role="alert">{error}</p>}
      <button type="button" className={ui.btn} style={{ justifySelf: "start" }} disabled={!quote || busy || renewFirst} onClick={request}>Request change</button>
    </section>
  );
}
