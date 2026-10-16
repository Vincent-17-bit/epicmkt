import { Link } from "react-router-dom";
import { statusLabel } from "./helpers.js";

const FIELD_LABELS = {
  owner_id_number: "ID number",
  phone: "Phone",
  email: "Email",
  sbp_number: "SBP number",
  kra_pin: "KRA PIN",
  reg_number: "Registration number",
  business_name: "Business name",
};

export default function DuplicatePanel({ duplicates, loading }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Duplicate check</h3>
        <span className={`status-pill ${duplicates.length ? "status-pill--danger" : "status-pill--neutral"}`}>
          {loading ? "Checking" : duplicates.length ? `${duplicates.length} match${duplicates.length > 1 ? "es" : ""}` : "Clear"}
        </span>
      </div>
      {duplicates.length ? (
        <ul className="stack-list">
          {duplicates.map((match) => (
            <li key={`${match.kind}-${match.id}-${match.field}`}>
              <span>
                <strong>{FIELD_LABELS[match.field] ?? match.field}</strong> matches{" "}
                {match.kind === "application" ? <Link className="inline-link" to={`/admin/applications/${match.id}`}>{match.reference}</Link> : match.reference}
                <br />
                <span className="muted">{match.name}</span>
              </span>
              <span className="status-pill status-pill--neutral">{match.kind === "business" ? "Business" : "Application"} · {statusLabel(match.status)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{loading ? "Looking for matching applications and businesses." : "No other application or business shares these details."}</p>
      )}
    </section>
  );
}
