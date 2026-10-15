import { Button, Card } from "../components/index.js";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import { useDashboard, useNotifications } from "../hooks/useDashboard.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { normalizeCounts } from "../api/counts.js";
import { useNow } from "./command/ActivityFeed.jsx";
import ActivityFeed from "./command/ActivityFeed.jsx";
import AttentionQueue from "./command/AttentionQueue.jsx";
import { NewVsLapsed, RevenueChart, StatusDonut } from "./command/Charts.jsx";
import ExpiryRadarPreview from "./command/ExpiryRadarPreview.jsx";
import KenyaPulseMap from "./command/KenyaPulseMap.jsx";
import KpiRow from "./command/KpiRow.jsx";
import QuickActions from "./command/QuickActions.jsx";
import TodaysBrief from "./command/TodaysBrief.jsx";
import s from "./command/command.module.css";

/**
 * The Command Center. Counts come from the same query as the sidebar badges; the rest from one dashboard read.
 * Realtime (see useLiveSync in the layout) invalidates both, so everything here refreshes without a reload.
 */
export default function CommandCenterPage() {
  const { can } = usePermissions();
  const counts = useAdminCounts();
  const dashboard = useDashboard();
  const notifications = useNotifications();
  const now = useNow(60_000);

  const failed = counts.isError && !counts.data;
  if (failed) {
    return (
      <div className="page-shell">
        <Card as="section" title="The Command Center could not load" headingLevel={2}>
          <div className={s.errorBox}>
            <p>The numbers did not come back. Check your connection, then try again.</p>
            <Button variant="primary" onClick={() => { counts.refetch(); dashboard.refetch(); }}>Try again</Button>
          </div>
        </Card>
      </div>
    );
  }

  const loadingCounts = counts.isPending;
  const loadingExtras = dashboard.isPending;
  const c = counts.data ?? normalizeCounts({});
  const data = dashboard.data;

  return (
    <div className="page-shell">
      <div className={s.page}>
        <TodaysBrief counts={c} waitingOver24h={data?.waitingOver24h ?? 0} can={can} loading={loadingCounts} now={now} />
        <KpiRow counts={c} data={data} can={can} loading={loadingCounts || loadingExtras} />
        <div className={s.grid}>
          <AttentionQueue counts={c} oldest={data?.oldest} can={can} loading={loadingCounts || loadingExtras} />
          <ActivityFeed notifications={notifications.data} loading={notifications.isPending} />
          <RevenueChart revenue={data?.revenue} loading={loadingExtras} />
          <StatusDonut counts={c} loading={loadingCounts} />
          <NewVsLapsed months={data?.newVsLapsed} loading={loadingExtras} />
          <QuickActions can={can} />
          <KenyaPulseMap loading={loadingExtras} />
          <ExpiryRadarPreview counts={c} nextExpiry={data?.oldest?.expiry ?? null} loading={loadingCounts} />
        </div>
        {dashboard.isError ? <p className={s.panelNote} role="status">Some charts could not refresh. The numbers above are still current.</p> : null}
      </div>
    </div>
  );
}
