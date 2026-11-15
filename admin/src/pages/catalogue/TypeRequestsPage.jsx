import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";

const ERRORS = {
  not_pending: "Someone already answered this request.",
  invalid_type: "Pick the type that now covers it.",
  note_required: "Tell the seller why, so they know what to do next.",
  forbidden: "You do not have permission to answer requests."
};
const message = (e) => ERRORS[e?.code ?? e?.message] ?? "Could not save. Try again.";
const STATUSES = [["pending", "Waiting"], ["resolved", "Resolved"], ["declined", "Declined"]];

/** Product types sellers asked for because none fit. Answer with an existing type, or decline with a note the seller sees. */
export default function TypeRequestsPage() {
  const uid = useId();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [notice, setNotice] = useState(null);
  const list = useQuery({ queryKey: ["admin-type-requests", status], queryFn: () => api.listTypeRequests(status) });
  const types = useQuery({ queryKey: ["admin-request-types"], queryFn: () => api.listRequestTypes() });
  const answer = useMutation({
    mutationFn: ({ id, outcome, typeId, note }) => api.resolveTypeRequest(id, outcome, typeId ?? null, note ?? null),
    onSuccess: (_, v) => { setNotice({ ok: true, text: v.outcome === "resolved" ? "Marked as resolved. The seller can now use that type." : "Declined. The seller will see your note." }); qc.invalidateQueries({ queryKey: ["admin-type-requests"] }); },
    onError: (e) => setNotice({ ok: false, text: message(e) })
  });
  const rows = list.data ?? [];

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h1 className="heading-sm" id={`${uid}-t`}>Type requests</h1></div>
      <p className="muted">Sellers ask for a product type when none fits. If a type already covers it, point them to it. If you add a new one, create it under <Link to="/admin/product-types">Product types</Link> first, then answer here.</p>
      <div className="kit-row">
        <label className="field">Show
          <select value={status} onChange={(e) => { setStatus(e.target.value); setNotice(null); }}>
            {STATUSES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
      </div>
      <p role="status" className={notice?.ok ? "muted" : "error-text"}>{notice?.text}</p>
      {list.isError ? <LoadError onRetry={() => list.refetch()} /> : null}
      {list.isPending ? <p className="muted" role="status">Loading…</p> : null}
      {list.data && rows.length === 0 ? <p className="muted">No requests here.</p> : null}
      {rows.length > 0 ? (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {rows.map((r) => <Request key={r.id} request={r} types={types.data ?? []} busy={answer.isPending} onAnswer={(a) => answer.mutate({ id: r.id, ...a })} />)}
        </ul>
      ) : null}
    </section>
  );
}

function Request({ request: r, types, onAnswer, busy }) {
  const id = useId();
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");
  return (
    <li className="panel" aria-labelledby={`${id}-n`}>
      <h2 className="heading-sm" id={`${id}-n`}>{r.name}</h2>
      <p className="muted">
        From <Link to={`/admin/businesses/${r.businessId}`}>{r.businessName}</Link>
        {r.alsoAskedBy > 0 ? ` · ${r.alsoAskedBy} other ${r.alsoAskedBy === 1 ? "shop" : "shops"} asked too` : ""}
      </p>
      {r.note ? <p>{r.note}</p> : null}
      {r.status !== "pending" ? (
        <p><span className="status-pill">{r.status === "resolved" ? "Resolved" : "Declined"}</span>{r.resolvedTypeId ? ` as ${r.resolvedTypeId}` : ""}{r.adminNote ? ` · ${r.adminNote}` : ""}</p>
      ) : (
        <div className="kit-row">
          <label className="field">Covered by type
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Choose a type</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <Button variant="primary" disabled={!typeId || busy} onClick={() => onAnswer({ outcome: "resolved", typeId })}>Resolve</Button>
          <label className="field">Note to the seller
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <Button disabled={busy} onClick={() => onAnswer({ outcome: "declined", note: note.trim() })}>Decline</Button>
        </div>
      )}
    </li>
  );
}
