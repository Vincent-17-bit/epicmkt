import { useSearchParams } from "react-router-dom";
import Tabs from "../components/Tabs.jsx";
import ComposeTab from "./broadcasts/ComposeTab.jsx";
import LogTab from "./broadcasts/LogTab.jsx";
import TemplatesTab from "./broadcasts/TemplatesTab.jsx";

const TABS = [{ id: "compose", label: "Compose" }, { id: "log", label: "Message log" }, { id: "templates", label: "Templates" }];

export default function BroadcastsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "compose";
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Broadcasts</h2></div>
        <Tabs tabs={TABS} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} label="Broadcast sections" idPrefix="broadcasts" />
        <div role="tabpanel" id="broadcasts-panel" aria-labelledby={`broadcasts-tab-${tab}`}>
          {tab === "compose" ? <ComposeTab /> : tab === "log" ? <LogTab /> : <TemplatesTab />}
        </div>
      </section>
    </div>
  );
}
