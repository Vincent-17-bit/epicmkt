import { useLocation } from "react-router-dom";
import { findRoute } from "../routes/config.js";

/** Step B1b only: a page that shows its title and nothing else. Each page replaces this in its own step. */
export default function PageStub() {
  const route = findRoute(useLocation().pathname);
  return (
    <div className="page-shell">
      <h2 className="stub-title">{route?.title}</h2>
    </div>
  );
}
