import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/index.js";
import Tabs from "../components/Tabs.jsx";
import FlagsTab from "./moderation/FlagsTab.jsx";
import ReportsTab from "./moderation/ReportsTab.jsx";
import CatalogTab from "./moderation/CatalogTab.jsx";

const TABS = [
  { id: "flags", label: "Flags" },
  { id: "reports", label: "Reports" },
  { id: "catalogue", label: "Catalogue" },
];

export default function ModerationPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "flags";
  const { data: counts } = useQuery({ queryKey: ["admin-moderation-counts"], queryFn: () => api.getModerationCounts(), refetchInterval: 60_000 });

  const tabCounts = counts ? { flags: counts.flags_open, reports: counts.reports_open, catalogue: "" } : undefined;
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Moderation</h2>
          {counts?.flags_overdue > 0 ? <span className="status-pill status-pill--down">{counts.flags_overdue} overdue</span> : null}
        </div>
        <Tabs tabs={TABS} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} counts={tabCounts} label="Moderation sections" idPrefix="moderation" />
        <div role="tabpanel" id="moderation-panel" aria-labelledby={`moderation-tab-${tab}`}>
          {tab === "flags" ? <FlagsTab /> : tab === "reports" ? <ReportsTab /> : <CatalogTab />}
        </div>
      </section>
    </div>
  );
}
