import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="page-shell">
      <section className="notice-card">
        <h2>Page not found</h2>
        <p>The admin page you asked for does not exist.</p>
        <Link className="button button--primary" to="/admin">Back to Command Center</Link>
      </section>
    </div>
  );
}
