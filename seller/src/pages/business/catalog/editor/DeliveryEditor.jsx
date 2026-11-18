import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShop, faStore, faTruckFast } from "@fortawesome/free-solid-svg-icons";
import { PAGE_LIMITS, checkItemDelivery, deliveryInfo, formatKes, itemDeliveryInfo } from "@epicmkt/shared";
import { useBusinessFacts } from "../../../../lib/useBusinessFacts.js";
import { usePlanFeatures } from "../../../../lib/usePlanFeatures.js";
import { previewLine } from "../../../../settings/ShopDelivery.jsx";
import { CheckRow, Field } from "./parts.jsx";
import styles from "./sections.module.css";
import editorStyles from "./editor.module.css";

const L = PAGE_LIMITS.delivery;
const asText = (v) => (v === null || v === undefined ? "" : String(v));
const shopValue = (f) => ({ offers: f?.delivers === true, fee: asText(f?.delivery_fee), radiusKm: asText(f?.delivery_radius_km), area: asText(f?.delivery_area), minOrder: asText(f?.delivery_min_order), notes: asText(f?.delivery_notes) });

/** The words a buyer reads for this item, from the same reader the item page uses. */
export function buyerLine(info) {
  if (!info.offers) return info.pickup || info.source === "item" ? "Pickup only: buyers collect it from you." : "No delivery: buyers collect it from you.";
  const parts = [info.fee === 0 ? "Free delivery" : info.fee != null ? `Delivery ${formatKes(info.fee)}` : "Delivery available"];
  if (info.area) parts.push(`to ${info.area}`);
  let line = parts.join(" ");
  if (info.time) line += ` · Arrives: ${info.time}`;
  if (info.pickup) line += " · Pickup available";
  return line;
}

const MODES = [
  { id: "shop", label: "Same as my shop", icon: faShop },
  { id: "custom", label: "Set delivery for this item", icon: faTruckFast },
  { id: "none", label: "Pickup only", icon: faStore }
];

// Delivery for one item (migration 0138). Most items follow the shop (Settings, Delivery); a heavy, fragile or fresh item can have its own fee,
// area and delivery time, or be pickup only.
export default function DeliveryEditor({ value, onChange, errors = {} }) {
  const facts = useBusinessFacts().data;
  const planHasDelivery = usePlanFeatures().delivery !== false;
  const v = value ?? { mode: "shop" };
  const set = (key) => (e) => onChange({ ...v, [key]: e.target.value });
  const town = [facts?.town, facts?.county].filter(Boolean).join(", ");
  const shop = shopValue(facts);
  const shopInfo = deliveryInfo({ delivery: { ...shop, fee: shop.fee === "" ? null : Number(shop.fee), radiusKm: shop.radiusKm === "" ? null : Number(shop.radiusKm), minOrder: shop.minOrder === "" ? null : Number(shop.minOrder) } });
  const checked = checkItemDelivery(v);
  const info = itemDeliveryInfo(checked.ok ? checked.value : null, shopInfo);

  return (
    <div className={styles.deliveryBlock} data-area="delivery">
      <p className={editorStyles.hint}>Buyers see this next to the price. Most items follow your shop; set it here only when this item is different, like a heavy sofa, a cake that needs care or a service done at the buyer's home.</p>
      <fieldset className={styles.modes}>
        <legend className={styles.legend}>How this item reaches the buyer</legend>
        {MODES.map((m) => {
          const off = m.id === "custom" && !planHasDelivery && v.mode !== "custom";
          return (
            <label key={m.id} className={styles.mode} data-on={v.mode === m.id ? "" : undefined} data-off={off ? "" : undefined}>
              <input type="radio" name="dl-mode" value={m.id} checked={v.mode === m.id} disabled={off}
                onChange={() => onChange({ ...v, mode: m.id, ...(m.id === "none" ? { pickup: true } : {}) })} />
              <FontAwesomeIcon icon={m.icon} className={styles.modeIcon} aria-hidden="true" />
              <span className={styles.modeText}>
                <strong>{m.label}</strong>
                <span>{m.id === "shop" ? (facts ? previewLine(shop, town) : "Your shop's delivery setting.")
                  : m.id === "custom" ? (planHasDelivery ? "Its own fee, area and delivery time." : "Delivery is not part of your plan.")
                  : "No delivery for this item: buyers collect it."}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {v.mode === "shop" && <p className={editorStyles.hint}>Change your shop's delivery in <Link to="/business/settings#delivery">Settings, Delivery</Link>.</p>}
      {v.mode === "custom" && (
        <div className={styles.modeBody}>
          <div className={editorStyles.grid}>
            <Field name="dl-fee" label="Delivery fee (KES)" area="delivery" inputMode="decimal" value={v.fee ?? ""} error={errors.fee} onChange={set("fee")}
              placeholder="150" hint="0 means free delivery. Leave it empty to agree the fee with each buyer." autoComplete="off" />
            <Field name="dl-time" label="Delivery time (optional)" area="delivery" max={L.time} value={v.time ?? ""} error={errors.time} onChange={set("time")}
              placeholder="Same day if ordered before 2 pm" autoComplete="off" />
          </div>
          <Field name="dl-area" label="Where you deliver it (optional)" area="delivery" max={L.area} value={v.area ?? ""} error={errors.area} onChange={set("area")}
            placeholder="Kisumu town, Milimani and Mamboleo" autoComplete="off" />
          <Field name="dl-notes" as="textarea" label="Notes (optional)" area="delivery" max={L.notes} value={v.notes ?? ""} error={errors.notes} onChange={set("notes")}
            placeholder="Delivered by our own van. Someone must be home to sign." />
          <CheckRow checked={v.pickup === true} onChange={(e) => onChange({ ...v, pickup: e.target.checked })}>Buyers can also pick it up from the shop</CheckRow>
        </div>
      )}
      {v.mode === "none" && (
        <div className={styles.modeBody}>
          <Field name="dl-notes" as="textarea" label="Pickup notes (optional)" area="delivery" max={L.notes} value={v.notes ?? ""} error={errors.notes} onChange={set("notes")}
            placeholder="Collect from our Kondele branch, Monday to Saturday." />
        </div>
      )}
      <p className={styles.buyerSees} role="status"><span>Buyers see:</span> {buyerLine(info)}</p>
    </div>
  );
}
