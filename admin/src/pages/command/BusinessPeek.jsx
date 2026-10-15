import { Link } from "react-router-dom";
import { Chip, Drawer } from "../../components/index.js";
import { usePermissions } from "../../hooks/usePermissions.js";
import { LAYERS, describeDays, formatDayEat } from "../../lib/pulse.js";
import s from "./pulse.module.css";

export default function BusinessPeek({ item, onClose }) {
  const { can } = usePermissions();
  if (!item) return null;
  const isApplication = item.kind === "application";
  const target = isApplication ? "/admin/applications" : "/admin/businesses";
  const allowed = can(isApplication ? "applications.view" : "businesses.view");
  const layers = LAYERS.filter((layer) => item.layers.includes(layer.key));
  return (
    <Drawer open onClose={onClose} title={item.name} description={isApplication ? "Application" : "Business"}>
      <dl className={s.peek}>
        <div><dt>County</dt><dd>{item.county || "Not set"}</dd></div>
        <div><dt>Status</dt><dd className={s.peekChips}>{layers.map((layer) => <Chip key={layer.key} tone={layer.tone}>{layer.label}</Chip>)}</dd></div>
        {isApplication ? <div><dt>Stage</dt><dd>{item.status.replace(/_/g, " ")}</dd></div> : (
          <div>
            <dt>Subscription</dt>
            <dd>{item.paid_until ? `${formatDayEat(item.paid_until)} (${describeDays(item.days).toLowerCase()})` : "No expiry date"}</dd>
          </div>
        )}
      </dl>
      {allowed ? <Link className={s.peekLink} to={target}>{isApplication ? "Open applications" : "Open businesses"}</Link> : null}
    </Drawer>
  );
}
