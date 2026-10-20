import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import { useToast } from "../../components/Toast.jsx";
import { downloadCsv, toCsv } from "../../components/DataTable/csv.js";
import { todayEat } from "../../lib/time.js";
import BulkDialog from "./BulkDialog.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { ACTIVE_ACTIONS, BIN_ACTIONS, BULK, summarize } from "./bulk.js";
import { columns } from "./columns.jsx";

// Extending a subscription is a finance action in the database; every other bulk action is reviewer or support.
const permissionFor = (name) => (name === "extend" ? "businesses.extend" : "businesses.bulk");

export default function BulkBar({ rows, ids, clear, tab, options }) {
  const { can, why } = usePermissions();
  const [action, setAction] = useState(null);
  const client = useQueryClient();
  const toast = useToast();
  const available = tab === "deleted" ? BIN_ACTIONS : ACTIVE_ACTIONS;
  const refresh = () => client.invalidateQueries({ queryKey: ["business-table"] });

  const submit = async ({ action: name, reason, params }) => {
    const result = await api.bulkBusinessAction({ action: name, ids, reason, params });
    if (name === "export") downloadCsv(`businesses-selected-${todayEat()}.csv`, toCsv(columns, rows));

    const undo = async () => {
      try {
        await api.undoBulkBusinessAction(result.undoToken);
        refresh();
        toast.push({ message: "Undone" });
      } catch (failure) {
        toast.push({ message: failure.message, tone: "error" });
      }
    };

    setAction(null);
    clear();
    refresh();
    toast.push({
      message: summarize(name, params, result),
      actionLabel: result.undoToken ? "Undo" : undefined,
      onAction: undo,
    });
  };

  return (
    <>
      <div className="bulk">
        {available.map((name) => (
          <Button
            key={name}
            size="sm"
            icon={BULK[name].icon}
            disabled={!can(permissionFor(name))}
            title={why(permissionFor(name))}
            onClick={() => setAction(name)}
          >
            {BULK[name].label}
          </Button>
        ))}
      </div>
      {action ? <BulkDialog action={action} count={ids.length} options={options} onClose={() => setAction(null)} onSubmit={submit} /> : null}
    </>
  );
}
