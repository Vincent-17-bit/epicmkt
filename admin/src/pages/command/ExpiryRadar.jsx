import { useId, useMemo, useRef, useState } from "react";
import { Button, Card, Skeleton } from "../../components/index.js";
import { BANDS, RADAR, RING_DAYS, bandCounts, describeDays, expiringItems, formatDayEat, layoutRadar, radiusFor } from "../../lib/pulse.js";
import { Glyph } from "./glyph.jsx";
import s from "./pulse.module.css";

const { size, centre, pointRadius } = RADAR;

export default function ExpiryRadar({ items, loading, onPeek }) {
  const [table, setTable] = useState(false);
  const [active, setActive] = useState(null);
  const tooltipId = useId();
  const wrapRef = useRef(null);
  const expiring = useMemo(() => expiringItems(items ?? []), [items]);
  const points = useMemo(() => layoutRadar(expiring), [expiring]);
  const counts = useMemo(() => bandCounts(expiring), [expiring]);
  const hovered = points.find((p) => p.id === active) ?? null;
  const urgent = counts.grace + counts.d1;

  const toggle = (
    <Button size="sm" aria-pressed={table} onClick={() => setTable((value) => !value)}>
      {table ? "View radar" : "View as table"}
    </Button>
  );

  return (
    <Card as="section" title="Expiry radar" headingLevel={2} className={s.span5} actions={loading ? null : toggle} data-slot="expiry-radar">
      {loading ? <Skeleton height="20rem" /> : (
        <div className={s.radar}>
          <p className={s.summary}>
            <strong>{expiring.length}</strong> {expiring.length === 1 ? "business expires" : "businesses expire"} within 30 days
            {urgent ? <>, <strong>{urgent}</strong> within a day or in grace</> : null}.
          </p>
          {table ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <caption className="sr-only">Businesses by time left on their subscription</caption>
                <thead><tr><th scope="col">Business</th><th scope="col">County</th><th scope="col">Expires</th><th scope="col">Ring</th><th scope="col"><span className="sr-only">Preview</span></th></tr></thead>
                <tbody>
                  {expiring.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.name}</th>
                      <td>{item.county}</td>
                      <td>{formatDayEat(item.paid_until)}<br /><span className={s.muted}>{describeDays(item.days)}</span></td>
                      <td>{item.band.label}</td>
                      <td><Button size="sm" variant="ghost" onClick={() => onPeek?.(item)} aria-label={`Preview ${item.name}`}>Peek</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={s.radarStage} ref={wrapRef}>
              <svg viewBox={`0 0 ${size} ${size}`} className={s.radarSvg} role="group" aria-label="Expiry radar: businesses by days until their subscription ends">
                {[-1, ...RING_DAYS].map((days) => (
                  <circle key={days} cx={centre} cy={centre} r={radiusFor(days)} className={days < 0 ? s.ringGrace : s.ring} />
                ))}
                <circle cx={centre} cy={centre} r="3" className={s.hub} />
                {[-1, ...RING_DAYS].map((days) => (
                  <text key={days} x={centre} y={centre - radiusFor(days) + 12} textAnchor="middle" className={s.ringLabel}>{days < 0 ? "Grace" : `${days}d`}</text>
                ))}
                {points.map((p) => (
                  <g
                    key={p.id}
                    transform={`translate(${p.x} ${p.y})`}
                    className={s.point}
                    data-active={active === p.id || undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.name}, ${p.county}. ${describeDays(p.days)}. ${p.band.label}. Press to preview.`}
                    aria-describedby={active === p.id ? tooltipId : undefined}
                    onMouseEnter={() => setActive(p.id)}
                    onMouseLeave={() => setActive((id) => (id === p.id ? null : id))}
                    onFocus={() => setActive(p.id)}
                    onBlur={() => setActive((id) => (id === p.id ? null : id))}
                    onClick={() => onPeek?.(p)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPeek?.(p); } }}
                  >
                    <circle r={pointRadius + 5} className={s.hit} />
                    <Glyph shape={p.band.shape} tone={p.band.tone} r={pointRadius} />
                  </g>
                ))}
              </svg>
              {hovered ? (
                <div id={tooltipId} role="tooltip" className={s.tooltip} style={{ left: `${(hovered.x / size) * 100}%`, top: `${(hovered.y / size) * 100}%` }}>
                  <strong>{hovered.name}</strong>
                  <span>{hovered.county}</span>
                  <span>{describeDays(hovered.days)}</span>
                </div>
              ) : null}
            </div>
          )}
          <ul className={s.legend} aria-label="Legend">
            {BANDS.map((band) => (
              <li key={band.key}>
                <svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true"><Glyph shape={band.shape} tone={band.tone} r={6} /></svg>
                <span>{band.label}</span>
                <b className={s.num}>{counts[band.key]}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
