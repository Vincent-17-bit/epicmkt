import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import StatusChip from "../../components/StatusChip.jsx";
import Tabs from "../../components/Tabs.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { DETAIL_BULK_ACTIONS, bulkPermission, canToggleVisibility, friendlyError, pickTab, stateInput, visibleTabs } from "../../lib/businessDetail.js";
import { deriveState } from "../../lib/status.js";
import { formatDate } from "../../lib/time.js";
import BulkDialog from "../businesses/BulkDialog.jsx";
import { BULK, summarize } from "../businesses/bulk.js";
import { ActivityTab, FlagsTab, ItemsTab, NotesTab, OverviewTab, PaymentsTab } from "./BusinessTabs.jsx";

export default function BusinessDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const { can, why } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState(null); // "visibility" | a bulk action name
  const [error, setError] = useState("");

  const tabs = visibleTabs(can);
  const tab = pickTab(params.get("tab"), tabs);
  const setTab = (next) => {
    const copy = new URLSearchParams(params);
    if (next === tabs[0].id) copy.delete("tab");
    else copy.set("tab", next);
    setParams(copy, { replace: true });
  };

  const detail = useQuery({
    queryKey: ["admin-business", id],
    queryFn: () => api.getBusinessDetail(id),
    retry: (count, failure) => failure?.code !== "not_found" && count < 1,
  });
  const options = useQuery({ queryKey: ["business-options"], queryFn: () => api.getBusinessFilterOptions(), enabled: Boolean(dialog && dialog !== "visibility"), staleTime: 60_000 });

  const name = detail.data?.business?.name;
  useEffect(() => {
    if (name) document.title = `${name} · EpicMKT Admin`;
    return () => {
      document.title = "EpicMKT Admin";
    };
  }, [name]);

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-business", id] });
    client.invalidateQueries({ queryKey: ["admin-business-activity", id] });
    client.invalidateQueries({ queryKey: ["business-table"] });
    client.invalidateQueries({ queryKey: ["admin-counts"] });
  };

  const visibility = useMutation({
    mutationFn: ({ visible, reason }) => api.setBusinessVisibility({ id, visible, reason }),
    onSuccess: (_r, { visible }) => {
      setDialog(null);
      setError("");
      toast.push({ message: visible ? "The business is visible to customers again." : "The business is hidden from customers." });
      refresh();
    },
    onError: (failure) => setError(friendlyError(failure)),
  });

  const runBulk = async ({ action, reason, params: actionParams }) => {
    const result = await api.bulkBusinessAction({ action, ids: [id], reason, params: actionParams });
    setDialog(null);
    refresh();
    toast.push({ message: summarize(action, actionParams, result) });
  };

  if (detail.isPending) {
    return (
      <div className="page-shell"><section className="panel" aria-busy="true"><p className="muted">Loading business…</p></section></div>
    );
  }
  if (detail.isError) {
    const missing = detail.error?.code === "not_found";
    return (
      <div className="page-shell">
        <section className="panel" role="alert">
          <h3>{missing ? "Business not found" : "We could not load this business"}</h3>
          <p>{missing ? "It may have been removed, or the link is wrong." : friendlyError(detail.error)}</p>
          <div className="biz-actions">
            {missing ? null : <Button onClick={() => detail.refetch()}>Try again</Button>}
            <Button onClick={() => navigate("/admin/businesses")}>Back to businesses</Button>
          </div>
        </section>
      </div>
    );
  }

  const { business: b } = detail.data;
  const state = deriveState(stateInput(b), new Date());
  const toggle = canToggleVisibility(b);
  const hidden = b.status === "paused";
  const extraActions = DETAIL_BULK_ACTIONS.filter((a) => can(bulkPermission(a)));

  return (
    <div className="page-shell">
      <nav className="biz-crumbs" aria-label="Breadcrumb">
        <Link to="/admin/businesses">Businesses</Link> <span aria-hidden="true">/</span> <span>{b.name}</span>
      </nav>

      <section className="panel biz-head">
        <div>
          <h2 className="biz-head__name">{b.name}</h2>
          <div className="biz-head__badges">
            <StatusChip state={state} />
            <span className="chip chip--neutral">{b.plan_key}</span>
            {b.verification_level === "verified" ? <span className="chip chip--live">Verified</span> : null}
            {b.featured ? <span className="chip chip--tint">Featured</span> : null}
            {b.strikes ? <span className="chip chip--danger">{b.strikes} strike{b.strikes === 1 ? "" : "s"}</span> : null}
          </div>
          <p className="muted">
            {b.seller_id} · {b.town ?? "—"}{b.paid_until ? ` · paid until ${formatDate(b.paid_until)}` : " · no payment confirmed yet"}
          </p>
        </div>
        <div className="biz-actions">
          {can("messages.view") ? <Link className="secondary-button admin-button" to={`/admin/messages?business=${id}`}>Open conversation</Link> : null}
          {toggle ? (
            <Button disabled={!can("businesses.visibility")} title={why("businesses.visibility")} onClick={() => { setError(""); setDialog("visibility"); }}>
              {hidden ? "Show to customers" : "Hide from customers"}
            </Button>
          ) : null}
          {extraActions.length > 0 && !b.deleted_at ? (
            <label className="biz-more">
              <span className="sr-only">More actions</span>
              <select
                value=""
                onChange={(event) => event.target.value && setDialog(event.target.value)}
              >
                <option value="">More actions…</option>
                {extraActions.map((a) => <option key={a} value={a}>{BULK[a].label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Business sections" idPrefix="biz" />
        <div id="biz-panel" role="tabpanel" aria-labelledby={`biz-tab-${tab}`} className="biz-body">
          {tab === "overview" ? <OverviewTab detail={detail.data} /> : null}
          {tab === "payments" ? <PaymentsTab id={id} /> : null}
          {tab === "items" ? <ItemsTab id={id} /> : null}
          {tab === "flags" ? <FlagsTab id={id} /> : null}
          {tab === "activity" ? <ActivityTab id={id} /> : null}
          {tab === "notes" ? <NotesTab id={id} /> : null}
        </div>
      </section>

      {dialog === "visibility" ? (
        <ConfirmDialog
          title={hidden ? `Show ${b.name} to customers?` : `Hide ${b.name} from customers?`}
          summary={hidden ? "The business will appear in search and on its page again." : "Customers will no longer see this business. You can show it again at any time."}
          confirmLabel={hidden ? "Show to customers" : "Hide from customers"}
          danger={!hidden}
          busy={visibility.isPending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => visibility.mutate({ visible: hidden, reason })}
        />
      ) : null}
      {dialog && dialog !== "visibility" && options.data ? (
        <BulkDialog action={dialog} count={1} options={options.data} onClose={() => setDialog(null)} onSubmit={runBulk} />
      ) : null}
    </div>
  );
}
