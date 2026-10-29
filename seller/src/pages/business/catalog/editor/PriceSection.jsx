import { useState } from "react";
import { ITEM_PRICE_TYPES, STATUS_CHOICES } from "@epicmkt/shared";
import { PRICED, priceSummary, stockStatusOf } from "./model.js";
import { CheckRow, Field, SectionCard } from "./parts.jsx";
import styles from "./editor.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const TYPE_HELP = {
  fixed: "One price for this item.",
  from: "Shows \"From\" before the price. Good when the final price depends on options.",
  range: "Shows a lowest and a highest price.",
  free: "Shows \"Free\". There is no price to enter.",
  contact: "Shows \"Contact for price\". Customers message you to ask.",
};
const COUNTED_TEXT = { available: "Available", limited_stock: "Low stock, customers see a Low stock tag", out_of_stock: "Out of stock, customers cannot see it" };

export default function PriceSection({ form, patch, errors }) {
  const priced = PRICED.includes(form.priceType);
  const range = form.priceType === "range";
  const hasSale = form.salePrice !== "" || Boolean(errors.salePrice);
  const [saleOpen, setSaleOpen] = useState(false);
  const showSale = priced && (saleOpen || hasSale);
  const resulting = form.trackStock ? stockStatusOf(form) : null;
  const countOk = /^\d{1,6}$/.test(String(form.stockCount).trim()) && /^\d{1,4}$/.test(String(form.lowStockThreshold).trim());
  const on = (k) => (e) => patch(k, e.target.value);

  return (
    <SectionCard id="price" title="Price and stock" required why="Clear prices get more messages. Stock tells customers what they can actually buy today.">
      <Field name="priceType" as="select" label="Price type" area="price" value={form.priceType} error={errors.priceType} onChange={on("priceType")} hint={TYPE_HELP[form.priceType]}>
        {ITEM_PRICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
      </Field>

      {priced && (
        <div className={styles.pair}>
          <Field name="price" label={range ? "Lowest price (KES)" : "Price (KES)"} area="price" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={form.price} error={errors.price} onChange={on("price")} />
          {range && <Field name="priceMax" label="Highest price (KES)" area="price" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={form.priceMax} error={errors.priceMax} onChange={on("priceMax")} />}
          {showSale && (
            <div className={styles.saleBox}>
              <Field name="salePrice" label="Sale price (KES, optional)" area="price" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={form.salePrice} error={errors.salePrice} onChange={on("salePrice")}
                hint="Must be below the regular price. Customers see the old price crossed out." />
              <button type="button" className={styles.linkBtn} onClick={() => { patch("salePrice", ""); setSaleOpen(false); }}>Remove sale price</button>
            </div>
          )}
        </div>
      )}
      {priced && !showSale && (
        <button type="button" className={styles.btnGhost} aria-expanded="false" onClick={() => setSaleOpen(true)}>Add a sale price</button>
      )}

      {form.priceType !== "contact" && (
        <Field name="unit" label="Unit (optional, such as per cut)" area="price" max={30} value={form.unit} error={errors.unit} onChange={on("unit")} autoComplete="off"
          hint="Shown after the price, like KES 500 per cut." />
      )}

      <fieldset className={styles.stockBox}>
        <legend className={styles.label}>Stock</legend>
        <CheckRow checked={form.trackStock} onChange={(e) => patch("trackStock", e.target.checked)} data-focus="trackStock">Count my stock</CheckRow>
        <p className={styles.hint}>
          {form.trackStock
            ? "Type how many you have. The item hides itself when you reach 0 and shows a Low stock tag when it is running low."
            : "Optional. Turn this on if you sell things you can count, like cakes or bottles. Services can skip it."}
        </p>
        {!form.trackStock && (
          <>
            <Field name="availability" as="select" label="Availability" area="stock" value={form.availability} error={errors.availability} onChange={on("availability")}>
              {STATUS_CHOICES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Field>
            {form.availability === "out_of_stock" && <p className={styles.hint}>Customers cannot see out of stock items. You can list it again any time with Back in stock.</p>}
          </>
        )}
        {form.trackStock && (
          <>
            <div className={styles.pair}>
              <Field name="stockCount" label="How many do you have now?" area="stock" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" maxLength={6} value={form.stockCount} error={errors.stockCount} onChange={on("stockCount")} />
              <Field name="lowStockThreshold" label="Tell customers it is low when this many or fewer are left" area="stock" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autoComplete="off" maxLength={4} value={form.lowStockThreshold} error={errors.lowStockThreshold} onChange={on("lowStockThreshold")} />
            </div>
            <CheckRow checked={form.showStockCount} onChange={(e) => patch("showStockCount", e.target.checked)}>When it is running low, show customers how many are left (for example Only 3 left)</CheckRow>
            {countOk && resulting && <p className={styles.hint} data-testid="stock-result">Right now: {COUNTED_TEXT[resulting]}.</p>}
          </>
        )}
      </fieldset>

      <p className={styles.summary} data-testid="price-summary" data-area="price">{priceSummary(form)}</p>
    </SectionCard>
  );
}
