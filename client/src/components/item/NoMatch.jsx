import { useEffect, useState } from "react";
import { filterLabel } from "@epicmkt/shared";
import { logUnmetDemand } from "../../api/index.js";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import styles from "./NoMatch.module.css";

const REASON = { not_sold: "nomatch.notSold", out_of_stock: "nomatch.outOfStock", unavailable: "nomatch.unavailable" };
const fill = (key, v) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{${k}}`, x), t(key));

/**
 * Shown when the combination the buyer just asked for is not on sale (not sold, sold out, or switched off). It says so, offers the closest
 * combinations that are on sale, and a button that tells the seller. Nothing is sent until the buyer taps the button, and the button sends
 * the filters only (never a name, a position or a device id).
 */
export default function NoMatch({ item, seller, option }) {
  const miss = option?.unmatched;
  const [state, setState] = useState("idle");   // idle | sending | sent | failed
  useEffect(() => setState("idle"), [miss]);
  if (!miss) return null;

  const send = async () => {
    setState("sending");
    const res = await logUnmetDemand({ businessId: seller?.id, itemId: item?.id, filters: miss.filters });
    setState(res?.ok === false ? "failed" : "sent");
  };
  const label = (v) => option.axes.map((a) => a.values?.find((x) => x.id === v.choice?.[a.key])?.label).filter(Boolean).join(" / ");
  const price = (v) => kesText(Number.isFinite(Number(v.salePrice)) && v.salePrice !== null ? v.salePrice : v.price);

  return (
    <section className={styles.root} role="region" aria-label={fill("nomatch.heading", { wanted: filterLabel(miss.filters) })}>
      <p className={styles.head}><strong>{fill("nomatch.heading", { wanted: filterLabel(miss.filters) })}</strong></p>
      <p className={styles.text}>{t(REASON[miss.reason] ?? REASON.not_sold)}</p>
      {miss.closest.length > 0 && (
        <div>
          <p className={styles.sub}>{t("nomatch.closest")}</p>
          <ul className={styles.list}>
            {miss.closest.map((v) => (
              <li key={v.id ?? JSON.stringify(v.choice)}>
                <button type="button" className={styles.match} onClick={() => option.choose(v.choice)}>
                  <span>{label(v)}</span>
                  <span className={styles.price}>{price(v)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.actions}>
        {state !== "sent" && (
          <button type="button" className={styles.tell} onClick={send} disabled={state === "sending"}>{state === "sending" ? t("nomatch.telling") : t("nomatch.tell")}</button>
        )}
        <button type="button" className={styles.quiet} onClick={() => option.dismissUnmatched()}>{t("nomatch.dismiss")}</button>
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {state === "sent" ? t("nomatch.thanks") : state === "failed" ? t("nomatch.failed") : ""}
      </p>
    </section>
  );
}
