import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import DataTable from "../components/DataTable/index.js";
import Tabs from "../components/Tabs.jsx";
import { FROM_LG } from "../lib/breakpoints.js";
import { useMediaQuery } from "../lib/useMediaQuery.js";
import BulkBar from "./businesses/BulkBar.jsx";
import Filters, { FiltersSheet } from "./businesses/Filters.jsx";
import { columns } from "./businesses/columns.jsx";
import { TABS, countFilters, emptyFilters } from "./businesses/filters.js";
import "./businesses/businesses.css";

const DEFAULT_SORT = { key: "paidUntil", dir: "asc" };
const ID_PREFIX = "businesses";

export default function BusinessesPage() {
  const [tab, setTab] = useState("all");
  const [filters, setFilters] = useState(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const extra = useMemo(() => ({ tab, filters }), [tab, filters]);
  const activeFilters = countFilters(filters);
  const wide = useMediaQuery(FROM_LG);

  const options = useQuery({
    queryKey: ["business-options"],
    queryFn: () => api.getBusinessFilterOptions(),
    staleTime: Infinity,
  });

  const counts = useQuery({
    queryKey: ["business-table", "counts", filters],
    queryFn: () => api.getBusinessTabCounts({ extra: { filters } }),
    placeholderData: (previous) => previous,
  });

  const applyExtra = (state) => {
    setTab(state?.tab ?? "all");
    setFilters({ ...emptyFilters, ...(state?.filters ?? {}) });
  };

  return (
    <div className="page-shell">
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={counts.data} label="Business status" idPrefix={ID_PREFIX} />

      {filtersOpen && options.data && wide ? <Filters value={filters} onChange={setFilters} options={options.data} /> : null}
      {filtersOpen && options.data && !wide ? (
        <FiltersSheet value={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} options={options.data} />
      ) : null}

      <div id={`${ID_PREFIX}-panel`} role="tabpanel" aria-labelledby={`${ID_PREFIX}-tab-${tab}`}>
        <DataTable
          columns={columns}
          queryKey={["business-table", "rows"]}
          storageKey="businesses"
          fetchPage={api.listBusinesses}
          fetchAll={api.listAllBusinesses}
          defaultSort={DEFAULT_SORT}
          extra={extra}
          onExtraChange={applyExtra}
          exportName="businesses"
          searchPlaceholder="Search name, phone, seller ID, slug, owner"
          emptyText={tab === "deleted" ? "The recycle bin is empty" : "No businesses match"}
          selectable
          rowLabel={(row) => row.name}
          toolbar={
            <Button icon={faFilter} aria-expanded={filtersOpen} aria-haspopup={wide ? undefined : "dialog"} onClick={() => setFiltersOpen((open) => !open)}>
              {activeFilters ? `Filters (${activeFilters})` : "Filters"}
            </Button>
          }
          renderBulk={({ rows, ids, clear }) =>
            options.data ? <BulkBar rows={rows} ids={ids} clear={clear} tab={tab} options={options.data} /> : null
          }
        />
      </div>
    </div>
  );
}
