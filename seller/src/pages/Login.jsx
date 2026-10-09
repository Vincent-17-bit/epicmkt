import { Link } from "react-router-dom";

export default function Login() {
  return (
    <main>
      <h1>Seller login</h1>
      <Link to="/forgot-password">Forgot password</Link>
    </main>
  );
}
