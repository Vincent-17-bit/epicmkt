import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="sx-center">
      <h1>Page not found</h1>
      <p><Link to="/business/account">Go to My Account</Link></p>
    </main>
  );
}
