import { useId } from "react";
import { Card, Skeleton } from "../../components/index.js";
import { compactNumber, formatKes, niceMax, statusSlices } from "../../lib/series.js";
import s from "./command.module.css";

// Plain SVG, no chart library: the data is six bars and five slices. Every chart has a text summary and a hidden data
// table, because a picture alone tells a screen reader nothing, and series differ by pattern or label, never colour alone.

const W = 480;
const H = 220;
const M = { top: 22, right: 8, bottom: 26, left: 40 };

function Axes({ max, ticks = 4 }) {
  const inner = H - M.top - M.bottom;
  return Array.from({ length: ticks + 1 }, (_, i) => {
    const value = (max / ticks) * i;
    const y = M.top + inner - (value / max) * inner;
    return (
      <g key={i}>
        <line x1={M.left} x2={W - M.right} y1={y} y2={y} className={s.gridLine} />
        <text x={M.left - 6} y={y + 4} textAnchor="end" className={s.axis}>{compactNumber(value)}</text>
      </g>
    );
  });
}

function DataTable({ caption, head, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}</tr>)}</tbody>
    </table>
  );
}

export function RevenueChart({ revenue = [], loading }) {
  const total = revenue.reduce((sum, m) => sum + m.kes, 0);
  const max = niceMax(Math.max(...revenue.map((m) => m.kes), 0));
  const inner = H - M.top - M.bottom;
  const slot = (W - M.left - M.right) / Math.max(revenue.length, 1);
  const bar = Math.min(48, slot * 0.58);
  const current = revenue.at(-1);
  const summary = `Confirmed revenue by month, last 6 months: total ${formatKes(total)}${current ? `, ${current.label} ${formatKes(current.kes)} so far` : ""}.`;
  return (
    <Card as="section" title="Revenue by month" headingLevel={2} className={s.span7} aria-busy={loading || undefined}>
      {loading ? <Skeleton variant="rect" height="14rem" /> : (
        <div className={s.chartWrap}>
          <p className={s.chartSummary}>Last 6 months: <strong>{formatKes(total)}</strong> confirmed. This month is the darker bar.</p>
          <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
            <Axes max={max} />
            {revenue.map((m, i) => {
              const h = (m.kes / max) * inner;
              const x = M.left + slot * i + (slot - bar) / 2;
              const last = i === revenue.length - 1;
              return (
                <g key={m.key}>
                  <rect x={x} y={M.top + inner - h} width={bar} height={Math.max(h, m.kes > 0 ? 1 : 0)} rx="4" fill="var(--chart-1)" opacity={last ? 1 : 0.55} />
                  <text x={x + bar / 2} y={M.top + inner - h - 6} textAnchor="middle" className={s.valueLabel}>{m.kes > 0 ? compactNumber(m.kes) : ""}</text>
                  <text x={x + bar / 2} y={H - 8} textAnchor="middle" className={s.axis}>{m.label}</text>
                </g>
              );
            })}
          </svg>
          <DataTable caption="Confirmed revenue by month" head={["Month", "Revenue"]} rows={revenue.map((m) => [`${m.label} ${m.year}`, formatKes(m.kes)])} />
        </div>
      )}
    </Card>
  );
}

export function StatusDonut({ counts, loading }) {
  const slices = statusSlices(counts);
  const total = slices.reduce((sum, x) => sum + x.value, 0);
  const R = 56;
  const C = 2 * Math.PI * R;
  const gap = total > slices.filter((x) => x.value > 0).length ? 2 : 0;
  let offset = 0;
  const summary = `Businesses by status: ${slices.map((x) => `${x.value} ${x.label.toLowerCase()}`).join(", ")}.`;
  return (
    <Card as="section" title="Business status" headingLevel={2} className={s.span5} aria-busy={loading || undefined}>
      {loading ? <Skeleton variant="rect" height="11rem" /> : (
        <div className={s.donutWrap}>
          <svg className={s.chart} viewBox="0 0 160 160" role="img" aria-label={summary}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--chart-grid)" strokeWidth="22" opacity={total === 0 ? 1 : 0} />
            {slices.map((x) => {
              if (x.value === 0 || total === 0) return null;
              const length = (x.value / total) * C;
              const dash = Math.max(length - gap, 0.5);
              const node = <circle key={x.key} cx="80" cy="80" r={R} fill="none" stroke={x.color} strokeWidth="22" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
              offset += length;
              return node;
            })}
            <text x="80" y="82" textAnchor="middle" className={s.donutCentre}>{total}</text>
            <text x="80" y="98" textAnchor="middle" className={s.donutCaption}>businesses</text>
          </svg>
          <ul className={s.donutLegend}>
            {slices.map((x) => (
              <li key={x.key}>
                <span className={s.swatch} style={{ background: x.color }} aria-hidden="true" />
                <span>{x.label}</span>
                <span className={s.num}>{x.value}</span>
                <span className={s.pct}>{total ? `${Math.round((x.value / total) * 100)}%` : "0%"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function NewVsLapsed({ months = [], loading }) {
  const patternId = useId();
  const max = niceMax(Math.max(...months.flatMap((m) => [m.added, m.lapsed]), 0));
  const inner = H - M.top - M.bottom;
  const slot = (W - M.left - M.right) / Math.max(months.length, 1);
  const bar = Math.min(22, slot * 0.3);
  const added = months.reduce((sum, m) => sum + m.added, 0);
  const lapsed = months.reduce((sum, m) => sum + m.lapsed, 0);
  const summary = `New against lapsed sellers by month, last 6 months: ${added} new, ${lapsed} lapsed.`;
  return (
    <Card as="section" title="New vs expired" headingLevel={2} className={s.span7} aria-busy={loading || undefined}>
      {loading ? <Skeleton variant="rect" height="14rem" /> : (
        <div className={s.chartWrap}>
          <ul className={s.legend}>
            <li><span className={s.swatch} style={{ background: "var(--chart-3)" }} aria-hidden="true" /> New sellers (first payment) <strong>{added}</strong></li>
            <li><span className={s.swatch} style={{ background: "repeating-linear-gradient(45deg, var(--chart-4) 0 3px, transparent 3px 6px)", border: "1px solid var(--chart-4)" }} aria-hidden="true" /> Expired (hatched) <strong>{lapsed}</strong></li>
          </ul>
          <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
            <defs>
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--surface)" /><rect width="3" height="6" fill="var(--chart-4)" />
              </pattern>
            </defs>
            <Axes max={max} />
            {months.map((m, i) => {
              const x0 = M.left + slot * i + (slot - bar * 2 - 4) / 2;
              const hA = (m.added / max) * inner;
              const hL = (m.lapsed / max) * inner;
              return (
                <g key={m.key}>
                  <rect x={x0} y={M.top + inner - hA} width={bar} height={hA} rx="3" fill="var(--chart-3)" />
                  <rect x={x0 + bar + 4} y={M.top + inner - hL} width={bar} height={hL} rx="3" fill={`url(#${patternId})`} stroke="var(--chart-4)" strokeWidth="1.5" />
                  <text x={x0 + bar / 2} y={M.top + inner - hA - 5} textAnchor="middle" className={s.valueLabel}>{m.added || ""}</text>
                  <text x={x0 + bar * 1.5 + 4} y={M.top + inner - hL - 5} textAnchor="middle" className={s.valueLabel}>{m.lapsed || ""}</text>
                  <text x={M.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className={s.axis}>{m.label}</text>
                </g>
              );
            })}
          </svg>
          <DataTable caption="New and expired sellers by month" head={["Month", "New", "Expired"]} rows={months.map((m) => [`${m.label} ${m.year}`, m.added, m.lapsed])} />
        </div>
      )}
    </Card>
  );
}
