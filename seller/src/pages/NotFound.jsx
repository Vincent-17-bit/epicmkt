import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{ padding: "var(--space-6) 0" }}>
      <h1 style={{ fontSize: "var(--text-xl)", margin: 0 }}>Page not found</h1>
      <p style={{ color: "var(--text-muted)" }}>
        <Link to="/business/hours" style={{ color: "var(--primary)" }}>
          Go to hours and closures
        </Link>
      </p>
    </div>
  );
}
