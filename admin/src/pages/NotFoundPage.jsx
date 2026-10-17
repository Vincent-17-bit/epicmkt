import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMapSigns } from "@fortawesome/free-solid-svg-icons";

export default function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found · EpicMKT Admin";
  }, []);

  return (
    <main className="not-found" id="main-content">
      <FontAwesomeIcon icon={faMapSigns} className="empty-state__icon" />
      <h1 className="empty-state__title">Page not found</h1>
      <p>The admin route you requested is not available.</p>
      <Link className="link" to="/admin">Back to Command Center</Link>
    </main>
  );
}
