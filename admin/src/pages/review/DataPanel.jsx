import { groupsFor } from "./helpers.js";

export default function DataPanel({ app, flagged, onFlag }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Application data</h3>
      </div>
      {groupsFor(app).map((group) => (
        <div key={group.title} className="data-group">
          <h4>{group.title}</h4>
          <dl>
            {group.rows.map((row) => (
              <div key={row.label} className={`data-row ${row.path && flagged.has(row.path) ? "is-flagged" : ""}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
                {row.path ? (
                  <button type="button" className="flag-button" aria-label={`Flag ${row.label}`} onClick={() => onFlag(row.path)}>
                    Flag
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
