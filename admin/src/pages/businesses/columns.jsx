import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faMinus, faStar } from "@fortawesome/free-solid-svg-icons";
import HealthRing from "../../components/HealthRing.jsx";
import StatusChip, { FlagChip, STATE_META } from "../../components/StatusChip.jsx";
import { compactCountdown, daysLeft, formatDate, formatDateTime } from "../../lib/time.js";
import { deriveState } from "../../lib/status.js";

const yesNo = (value) => (value ? "Yes" : "No");

export const columns = [
  {
    key: "name",
    header: "Business",
    locked: true,
    card: "title",
    min: 240,
    grow: 2,
    sortKey: true,
    render: (row) => (
      <div className="biz-name">
        <span className="biz-logo" aria-hidden="true">{row.name[0]}</span>
        <div className="dt__stack">
          <strong>{row.name}</strong>
          <span>{row.slug}</span>
        </div>
      </div>
    ),
    accessor: (row) => row.name,
  },
  { key: "category", header: "Category", accessor: (row) => row.category },
  { key: "town", header: "Town", accessor: (row) => row.town },
  {
    key: "owner",
    header: "Owner",
    min: 170,
    render: (row) => (
      <div className="dt__stack">
        <strong>{row.ownerName}</strong>
        <span>{row.phone}</span>
      </div>
    ),
    csv: (row) => `${row.ownerName} ${row.phone}`,
  },
  {
    key: "status",
    header: "Status",
    card: "status",
    min: 150,
    render: (row) => <StatusChip state={deriveState(row)} />,
    csv: (row) => STATE_META[deriveState(row)].label,
  },
  { key: "plan", header: "Plan", min: 100, accessor: (row) => row.plan },
  {
    key: "verified",
    header: "Verified",
    min: 120,
    render: (row) => (
      <span className="biz-mark">
        <FontAwesomeIcon icon={row.verified ? faCircleCheck : faMinus} />
        {row.verified ? "Verified" : "No"}
      </span>
    ),
    csv: (row) => yesNo(row.verified),
  },
  {
    key: "featured",
    header: "Featured",
    min: 120,
    render: (row) => (
      <span className="biz-mark">
        <FontAwesomeIcon icon={row.featured ? faStar : faMinus} />
        {row.featured ? "Featured" : "No"}
      </span>
    ),
    csv: (row) => yesNo(row.featured),
  },
  {
    key: "paidUntil",
    header: "Paid until",
    card: "metric",
    min: 150,
    sortKey: true,
    render: (row) => (
      <div className="dt__stack">
        <strong>{formatDate(row.paidUntil)}</strong>
        <span>{compactCountdown(daysLeft(row.paidUntil))}</span>
      </div>
    ),
    csv: (row) => row.paidUntil,
  },
  { key: "items", header: "Items", min: 90, align: "end", sortKey: true, accessor: (row) => row.items },
  {
    key: "flags",
    header: "Flags",
    min: 120,
    render: (row) => (row.openFlags ? <FlagChip count={row.openFlags} /> : "None"),
    csv: (row) => row.openFlags,
  },
  {
    key: "health",
    header: "Health",
    min: 90,
    align: "end",
    sortKey: "healthScore",
    render: (row) => <HealthRing score={row.healthScore} />,
    accessor: (row) => row.healthScore,
  },
  {
    key: "lastLogin",
    header: "Last login",
    min: 150,
    sortKey: true,
    render: (row) => formatDateTime(row.lastLogin),
    csv: (row) => row.lastLogin,
  },
  {
    key: "createdAt",
    header: "Created",
    min: 130,
    sortKey: true,
    hiddenByDefault: true,
    render: (row) => formatDate(row.createdAt),
    csv: (row) => row.createdAt,
  },
  {
    key: "lastEdit",
    header: "Last edit",
    min: 150,
    sortKey: true,
    hiddenByDefault: true,
    render: (row) => formatDateTime(row.lastEdit),
    csv: (row) => row.lastEdit,
  },
  { key: "strikes", header: "Strikes", min: 90, align: "end", sortKey: true, hiddenByDefault: true, accessor: (row) => row.strikes },
  { key: "agent", header: "Agent", min: 150, hiddenByDefault: true, render: (row) => row.agent ?? "Unassigned", csv: (row) => row.agent ?? "" },
  { key: "tags", header: "Tags", min: 150, hiddenByDefault: true, render: (row) => row.tags.join(", ") || "None", csv: (row) => row.tags.join("; ") },
];
