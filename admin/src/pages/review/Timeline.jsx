import { eventText, fmtDateTime } from "./helpers.js";

export default function Timeline({ events, loading }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Timeline</h3>
      </div>
      {loading ? (
        <span className="skeleton" />
      ) : events.length ? (
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.id} className={`timeline__item timeline__item--${event.actor}`}>
              <span>{eventText(event)}</span>
              <span className="muted">{event.actor === "seller" ? "Applicant" : event.actor === "system" ? "System" : "Admin"} · {fmtDateTime(event.createdAt)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No events yet.</p>
      )}
    </section>
  );
}
