import { api } from "../api/index.js";
import DataTable from "../components/DataTable/index.js";
import HealthRing from "../components/HealthRing.jsx";
import { compactCountdown, daysLeft, formatBusinessDate, formatDate, formatDateTime } from "../lib/time.js";

const columns = [
  {
    key: "name",
    header: "Business",
    locked: true,
    min: 220,
    grow: 2,
    sortKey: true,
    render: (row) => (
      <div className="dt__stack">
        <strong>{row.name}</strong>
        <span>{row.slug}</span>
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
  { key: "plan", header: "Plan", min: 100, accessor: (row) => row.plan },
  {
    key: "paidUntil",
    header: "Paid until",
    min: 150,
    sortKey: true,
    render: (row) => (
      <div className="dt__stack">
        <strong>{formatBusinessDate(row.paidUntil)}</strong>
        <span>{compactCountdown(daysLeft(row.paidUntil))}</span>
      </div>
    ),
    csv: (row) => row.paidUntil,
  },
  { key: "items", header: "Items", min: 90, align: "end", sortKey: true, accessor: (row) => row.items },
  {
    key: "healthScore",
    header: "Health",
    min: 90,
    align: "end",
    sortKey: true,
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
];

export default function DataTableTestPage() {
  return (
    <div className="page-shell">
      <DataTable
        columns={columns}
        queryKey={["data-table-test"]}
        storageKey="data-table-test"
        fetchPage={api.listBusinesses}
        fetchAll={api.listAllBusinesses}
        defaultSort={{ key: "name", dir: "asc" }}
        exportName="businesses"
        searchPlaceholder="Search name, phone, seller ID, slug, owner"
        selectable
      />
    </div>
  );
}
