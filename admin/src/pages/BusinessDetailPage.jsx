import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { DETAIL_TABS, actionsFor, statusLabel, statusTone } from "../lib/businesses.js";
import { errorMessage } from "../lib/errors.js";
import { useAdminRole } from "../lib/useAdminRole.js";
import { fmtDate } from "../lib/peek.js";
import ActionDialog from "../components/ActionDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import MessageDialog from "../components/MessageDialog.jsx";
import { CountdownRing, HealthRing } from "../components/Rings.jsx";
import OverviewTab from "./business/OverviewTab.jsx";
import { ActivityTab, DocumentsTab, HoursTab, LaterTab, MessagesTab, NotesTab, PaymentsTab, TeamTab } from "./business/Tabs.jsx";

export default function BusinessDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const role = useAdminRole();
  const [dialog, setDialog] = useState(null); // an action key, or "message"
  const [notice, setNotice] = useState("");

  const tabKey = DETAIL_TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "overview";
  const setTab = (key) => {
    const next = new URLSearchParams(params);
    if (key === "overview") next.delete("tab"); else next.set("tab", key);
    setParams(next, { replace: true });
  };

  const detail = useQuery({ queryKey: ["admin-business", id], queryFn: () => api.getBusinessDetail(id), retry: (n, e) => e?.code !== "not_found" && n < 1 });
  const { data: agents = [] } = useQuery({ queryKey: ["admin-agents"], queryFn: () => api.listAgents(), staleTime: 5 * 60_000 });

  useEffect(() => {
    const name = detail.data?.business?.name;
    if (name) document.title = `${name} · EpicMKT Admin`;
    return () => { document.title = "EpicMKT Admin"; };
  }, [detail.data?.business?.name]);

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-business", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-business-tab", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
  };

  const act = useMutation({
    mutationFn: ({ key, form }) => api.runBusinessAction(key, id, form),
    onSuccess: (_res, { key }) => { setDialog(null); setNotice(`${key === "delete" ? "Moved to the recycle bin" : "Done"}.`); afterChange(); },
  });
  const send = useMutation({
    mutationFn: (payload) => api.messageBusiness(id, payload),
    onSuccess: () => { setDialog(null); setNotice("Message sent."); afterChange(); setTab("messages"); },
  });

  if (detail.isLoading) {
    return <div className="page-shell"><section className="panel" aria-busy="true"><span className="skeleton skeleton--title" /><span className="skeleton" /><span className="skeleton" /></section></div>;
  }
  if (detail.isError) {
    const missing = detail.error?.code === "not_found" || detail.error?.message === "not_found";
    return (
      <div className="page-shell"><section className="panel">
        {missing
          ? <EmptyState title="Business not found" icon="🔎" action={{ label: "Back to businesses", onClick: () => navigate("/admin/businesses") }}>It may have been removed, or the link is wrong.</EmptyState>
          : <p className="form-error" role="alert">{errorMessage(detail.error)} <button type="button" className="link-button" onClick={() => detail.refetch()}>Try again</button></p>}
      </section></div>
    );
  }

  const d = detail.data;
  const b = d.business;
  const actions = actionsFor(b, role);
  const canMessage = ["owner", "reviewer", "support"].includes(role) && !b.deleted_at;
  const agentName = agents.find((a) => a.user_id === b.assigned_agent);
  const active = dialog && dialog !== "message" ? dialog : null;

  return (
    <div className="page-shell">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/admin/businesses">Businesses</Link><span aria-hidden="true"> / </span><span>{b.name}</span></nav>

      <section className="panel detail-head">
        <div className="detail-head__main">
          <CountdownRing paidUntil={b.paid_until} size={84} />
          <div>
            <h2 className="detail-head__name">{b.name}</h2>
            <div className="detail-head__badges">
              <span className={`status-pill status-pill--${statusTone(b.status)}`}>{statusLabel(b.status)}</span>
              <span className="tag">{b.plan_key}</span>
              {b.verification_level === "verified" ? <span className="tag tag--good">Verified</span> : null}
              {b.featured ? <span className="tag tag--accent">Featured</span> : null}
              {b.strikes ? <span className="tag tag--warn">{b.strikes} strike{b.strikes === 1 ? "" : "s"}</span> : null}
              <span className="muted">{b.seller_id} · {b.town ?? "—"}</span>
            </div>
            <p className="muted detail-head__paid">{b.paid_until ? `Paid until ${fmtDate(b.paid_until)}` : "No payment confirmed yet"}</p>
          </div>
        </div>
        <div className="detail-head__health"><HealthRing score={d.health} size={72} /><span>Health</span></div>
      </section>

      <section className="panel action-bar" aria-label="Actions">
        <div className="action-bar__row">
          <Link className="secondary-button" to={`/admin/businesses/${id}/view-as-seller`}>View as seller</Link>
          <button type="button" className="secondary-button" disabled={!canMessage} onClick={() => setDialog("message")} title={canMessage ? undefined : "Your role cannot message sellers"}>Message</button>
          <span className="action-bar__sep" aria-hidden="true" />
          {actions.map((a) => (
            <button key={a.key} type="button" className={a.danger ? "danger-button" : "secondary-button"} disabled={!a.allowed}
              title={a.allowed ? a.help : "Your role cannot do this"} onClick={() => { setNotice(""); setDialog(a.key); }}>{a.label}</button>
          ))}
        </div>
        <div aria-live="polite">{notice ? <p className="notice" role="status">{notice} <button type="button" className="link-button" onClick={() => setNotice("")}>Dismiss</button></p> : null}</div>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="Business sections">
          {DETAIL_TABS.map((t) => (
            <button key={t.key} role="tab" type="button" id={`tab-${t.key}`} aria-selected={tabKey === t.key} aria-controls="tab-panel" className={`tabs__tab ${tabKey === t.key ? "is-on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}{t.later ? <span className="tabs__soon">soon</span> : null}
            </button>
          ))}
        </div>
        <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tabKey}`} className="tab-body">
          {tabKey === "overview" ? <OverviewTab detail={d} agentName={agentName?.display_name ?? agentName?.email} /> : null}
          {tabKey === "documents" ? <DocumentsTab id={id} /> : null}
          {tabKey === "payments" ? <PaymentsTab id={id} /> : null}
          {tabKey === "messages" ? <MessagesTab id={id} canCompose={canMessage} onCompose={() => setDialog("message")} /> : null}
          {tabKey === "activity" ? <ActivityTab id={id} /> : null}
          {tabKey === "notes" ? <NotesTab id={id} /> : null}
          {tabKey === "hours" ? <HoursTab business={b} /> : null}
          {tabKey === "team" ? <TeamTab id={id} /> : null}
          {DETAIL_TABS.find((t) => t.key === tabKey)?.later ? <LaterTab label={DETAIL_TABS.find((t) => t.key === tabKey).label} /> : null}
        </div>
      </section>

      {active ? <ActionDialog actionKey={active} business={b} onSubmit={(form) => act.mutateAsync({ key: active, form })} onClose={() => setDialog(null)} /> : null}
      {dialog === "message" ? <MessageDialog business={b} onSubmit={(payload) => send.mutateAsync(payload)} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
