import { useId, useMemo, useState } from "react";
import { formatKes } from "@epicmkt/shared";
import { sandboxItem, sandboxTypes } from "../../lib/readiness.js";

// A throwaway item of one type, built in memory so an admin can see what a seller and a buyer would get. Nothing is saved or sent anywhere.
export default function ReadinessSandbox({ initialType = "phone" }) {
  const uid = useId();
  const types = useMemo(() => sandboxTypes(), []);
  const [typeId, setTypeId] = useState(types.some((t) => t.id === initialType) ? initialType : types[0]?.id);
  const [complete, setComplete] = useState(true);
  const item = useMemo(() => sandboxItem(typeId, { complete }), [typeId, complete]);

  return (
    <section className="panel readiness-sandbox" aria-labelledby={`${uid}-title`}>
      <div className="panel__header"><h2 className="heading-sm" id={`${uid}-title`}>Sandbox</h2></div>
      <p className="muted">Builds a throwaway item of a product type in memory, to try what a seller fills in and what a buyer sees. Nothing is saved, and no shop is touched.</p>
      <div className="readiness-sandbox__controls">
        <label className="field">Product type
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <label className="readiness-sandbox__toggle">
          <input type="checkbox" checked={!complete} onChange={(e) => setComplete(!e.target.checked)} />
          <span>Leave the required answers empty</span>
        </label>
      </div>
      {item ? (
        <div className="readiness-sandbox__grid">
          <article className="readiness-card" aria-label="What a buyer sees in a list">
            <h3 className="heading-sm">{item.card.name}</h3>
            <p className="readiness-card__price">{item.price.available === false ? "Cannot be priced" : `${item.card.hasPriceRange ? "From " : ""}${formatKes(item.card.priceMin ?? item.price.unit)}`}</p>
            <p className="muted">{item.combinations ? `${item.combinations} combinations` : "No options"} · {item.type.kind ?? "good"}</p>
          </article>
          <div>
            <h3 className="heading-sm">What a seller chooses</h3>
            {item.axes.length === 0 ? <p className="muted">This type has no options.</p> : (
              <ul className="readiness-list">
                {item.axes.map((a) => <li key={a.key}><strong>{a.label}</strong>{a.dependsOn ? <span className="muted"> (depends on {a.dependsOn})</span> : null}: {a.values.join(", ")}</li>)}
              </ul>
            )}
            <h3 className="heading-sm">Publish check</h3>
            {item.blockers.length === 0
              ? <p className="readiness-ok"><span aria-hidden="true">✓ </span>Nothing stops a seller publishing this.{item.warnings.length ? ` ${item.warnings.length} recommended ${item.warnings.length === 1 ? "answer is" : "answers are"} still open.` : ""}</p>
              : (
                <div role="status">
                  <p className="readiness-bad"><span aria-hidden="true">✕ </span>A seller could not publish. They would be told:</p>
                  <ul className="readiness-list">{item.blockers.map((b) => <li key={b.key}>{b.message}</li>)}</ul>
                </div>
              )}
          </div>
          <details className="readiness-sandbox__payload">
            <summary>What the seller form would send</summary>
            <pre tabIndex={0}>{JSON.stringify(item.payload, null, 2)}</pre>
          </details>
        </div>
      ) : <p className="muted">Pick a type.</p>}
    </section>
  );
}
