export default function NotFoundPage() {
  return (
    <div className="page-shell empty-state">
      <h2>Page not found</h2>
      <p>The admin route you requested is not available.</p>
      <a href="/admin">Back to Command Center</a>
    </div>
  );
}
