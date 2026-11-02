import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { errorText } from "../../../../lib/errors.js";
import ui from "../../../../styles/ui.module.css";
import Chart from "./Chart.jsx";
import styles from "./panel.module.css";

const RANGES = [7, 30, 90];
const LOW = 20;

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "0%");

export default function Performance({ item, showing }) {
  const [days, setDays] = useState(30);
  const stats = useQuery({ queryKey: ["item", item.id, "stats", days], queryFn: () => api.getItemStats(item.id, days), placeholderData: (prev) => prev });
  const s = stats.data;
  const empty = s && s.views === 0 && s.taps === 0;
  const low = s && !empty && s.views < LOW;
  const last = useMemo(() => (s?.series?.length ? formatDate(`${s.series[s.series.length - 1].day}T12:00:00Z`) : ""), [s]);
  return (
    <section className={styles.stack} aria-labelledby="panel-performance">
      <div className={styles.rowBetween}>
        <h3 id="panel-performance" className={styles.h3}>How it is doing</h3>
        <div className={styles.segment} role="group" aria-label="Time range">
          {RANGES.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div>
      </div>

      {stats.isPending && (
        <div className={styles.skeletonStack} aria-busy="true" data-testid="stats-skeleton">
          <div className={styles.tiles}>{[0, 1, 2, 3].map((n) => <span key={n} className={styles.skeletonTile} />)}</div>
          <span className={styles.skeletonChart} />
        </div>
      )}

      {stats.isError && !s && (
        <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
          <h2>We could not load the numbers</h2>
          <p>{errorText(stats.error)}</p>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => stats.refetch()}>Try again</button>
        </div>
      )}

      {s && (
        <>
          {!showing && <p className={ui.muted}>This item is not showing to customers right now, so it is not getting new visits.</p>}
          {empty && <p className={styles.note} data-testid="stats-empty">No one has opened this item in the last {days} days. A visit is counted when a customer opens the item. Share the link to get the first ones.</p>}
          {low && <p className={styles.note} data-testid="stats-low">Only {s.views} {s.views === 1 ? "visit" : "visits"} so far. Percentages can jump around when there are this few.</p>}
          <dl className={styles.tiles} data-testid="stats-tiles">
            <div className={styles.tile}><dt>Views</dt><dd>{s.views}</dd></div>
            <div className={styles.tile}><dt>WhatsApp taps</dt><dd>{s.whatsapp}</dd></div>
            <div className={styles.tile}><dt>Call taps</dt><dd>{s.calls}</dd></div>
            <div className={styles.tile}><dt>Tapped to contact</dt><dd>{pct(s.taps, s.views)}</dd></div>
          </dl>
          <Chart series={s.series} label={`Views per day, last ${days} days`} />
          <p className={styles.axisNote}>Counted per day in your shop's time zone. Latest day: {last}.</p>
          <ul className={styles.attrib} aria-label="Where visits came from">
            <li><strong>Flash sales</strong><span>{s.flashViews} {s.flashViews === 1 ? "view" : "views"}, {s.flashTaps} {s.flashTaps === 1 ? "tap" : "taps"}</span></li>
            <li><strong>Offers</strong><span>{s.offerViews} {s.offerViews === 1 ? "view" : "views"}, {s.offerTaps} {s.offerTaps === 1 ? "tap" : "taps"}</span></li>
          </ul>
        </>
      )}
    </section>
  );
}
