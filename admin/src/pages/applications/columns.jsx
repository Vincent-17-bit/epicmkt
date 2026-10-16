import { Link } from "react-router-dom";
import { Button, Chip, StatusChip } from "../../components/index.js";
import { formatEatStamp, relativeAgo } from "../../lib/eat.js";
import { slaState } from "../../lib/sla.js";
import SlaBadge from "./SlaBadge.jsx";
import s from "./applications.module.css";

const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
const toDate = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const prettyId = (id) => String(id ?? "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const planLabel = (plan) => (plan === "premium" ? "Premium" : "Standard");
const place = (row) => [row.town, row.county].filter(Boolean).join(", ");

/**
 * Where a business name goes when clicked. The review page arrives in step B2b; until then this returns null and the
 * name is plain text. Change this one function (for example to `/admin/applications/${row.id}`) and the name becomes a
 * link, on the table and on the phone cards.
 */
export const openHref = () => null;

/**
 * @param ctx { now: Date, me: string|null, reviewers: Map<id, {name}>, can: (action) => boolean,
 *              onStartReview: (row) => void, starting: string|null  (id of the application being started) }
 * Every column has a csv accessor except Actions. Export includes hidden columns too, so Owner, Phone, Fee and
 * Reference are there when someone needs them in a spreadsheet.
 */
export function buildColumns({ now, me, reviewers, can, onStartReview, starting }) {
  const nameOf = (id) => reviewers.get(id)?.name ?? "A colleague";
  return [
    {
      key: "business", header: "Business", sortKey: "business_name", primary: true, locked: true, sticky: true, width: "minmax(13rem, 1.6fr)", min: 208,
      cell: (row) => {
        const href = openHref(row);
        return (
          <span className={s.stack}>
            {href ? <Link to={href} className={s.nameLink}>{row.business_name}</Link> : <span className={s.name}>{row.business_name}</span>}
            <span className={s.sub}>{row.reference_no}</span>
          </span>
        );
      },
      csv: (row) => row.business_name,
    },
    { key: "sla", header: "24 h SLA", width: "minmax(9.5rem, 1fr)", min: 152, cell: (row) => <SlaBadge application={row} now={now} />,
      csv: (row) => { const sla = slaState(row, now); return sla.state === "none" ? "" : `${sla.label}${sla.detail ? ` (${sla.detail})` : ""}`; } },
    {
      key: "submitted", header: "Submitted", sortKey: "submitted_at", width: "minmax(8rem, 0.8fr)", min: 128,
      cell: (row) => {
        const d = toDate(row.submitted_at);
        if (!d) return <span className={s.muted}>Not submitted</span>;
        const ago = relativeAgo(d, now);
        return <span className={s.stack}><span title={formatEatStamp(d)}>{formatEatStamp(d).replace(" EAT", "")}</span><span className={s.sub}>{ago === "Active now" ? "Just now" : ago}</span></span>;
      },
      csv: (row) => row.submitted_at ?? "",
    },
    { key: "status", header: "Status", sortKey: "status", width: "minmax(9.5rem, 0.9fr)", min: 152, cell: (row) => <StatusChip status={row.status} />, csv: (row) => row.status },
    {
      key: "category", header: "Category", sortKey: "category_id", width: "minmax(8rem, 1fr)", min: 128,
      cell: (row) => <span className={s.stack}><span title={row.category_name ?? prettyId(row.category_id)}>{row.category_name ?? prettyId(row.category_id)}</span><span className={s.sub}>{planLabel(row.plan_key)} plan</span></span>,
      csv: (row) => row.category_name ?? prettyId(row.category_id),
    },
    {
      key: "assignee", header: "Assigned to", width: "minmax(8rem, 0.9fr)", min: 128,
      cell: (row) => row.reviewer_id
        ? <span className={row.reviewer_id === me ? s.you : undefined}>{row.reviewer_id === me ? "You" : nameOf(row.reviewer_id)}</span>
        : <span className={s.muted}>Unassigned</span>,
      csv: (row) => (row.reviewer_id ? nameOf(row.reviewer_id) : "Unassigned"),
    },
    { key: "reference", header: "Reference", defaultHidden: true, card: false, width: "minmax(9rem, 0.8fr)", min: 136, cell: (row) => <span className={s.mono}>{row.reference_no}</span>, csv: (row) => row.reference_no },
    { key: "plan", header: "Plan", sortKey: "plan_key", defaultHidden: true, width: "minmax(7rem, 0.6fr)", min: 104, cell: (row) => <Chip tone={row.plan_key === "premium" ? "info" : "neutral"}>{planLabel(row.plan_key)}</Chip>, csv: (row) => row.plan_key },
    { key: "fee", header: "Fee", sortKey: "price_at_submission", defaultHidden: true, align: "end", width: "minmax(7rem, 0.6fr)", min: 112, cell: (row) => kes(row.price_at_submission), csv: (row) => row.price_at_submission },
    { key: "owner", header: "Owner", sortKey: "owner_full_name", defaultHidden: true, width: "minmax(10rem, 1fr)", min: 160, cell: (row) => row.owner_full_name, csv: (row) => row.owner_full_name },
    { key: "phone", header: "Phone", defaultHidden: true, width: "minmax(9rem, 0.8fr)", min: 144, cell: (row) => <a href={`tel:${row.phone}`} className={s.plain}>{row.phone}</a>, csv: (row) => row.phone },
    { key: "location", header: "Location", defaultHidden: true, width: "minmax(10rem, 0.9fr)", min: 160, cell: place, csv: place },
    { key: "verification", header: "Verification", defaultHidden: true, width: "minmax(9rem, 0.7fr)", min: 128, cell: (row) => <Chip tone={row.verification_level === "verified" ? "success" : "neutral"}>{row.verification_level === "verified" ? "Verified" : "Unverified"}</Chip>, csv: (row) => row.verification_level },
    {
      key: "actions", header: "Actions", hideHeader: true, actions: true, stickyEnd: true, locked: true, chooser: false, csv: false, align: "end", width: "minmax(8.5rem, auto)", min: 136,
      cell: (row) => (row.status === "submitted" && can("applications.decide")
        ? <Button size="sm" variant="primary" loading={starting === row.id} onClick={() => onStartReview(row)} aria-label={`Start review of ${row.business_name}`}>Start review</Button>
        : null),
    },
  ];
}
