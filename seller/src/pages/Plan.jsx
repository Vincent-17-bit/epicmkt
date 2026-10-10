import { Link } from "react-router-dom";

/** Placeholder: the plan and billing page is built separately. */
export default function Plan() {
  return (
    <main className="sx-page">
      <h1>Plan and billing</h1>
      <p>Plan changes and payments are coming to this page. To upgrade now, contact EpicMKT support.</p>
      <p><Link to="/business/account">Back to My Account</Link></p>
    </main>
  );
}
