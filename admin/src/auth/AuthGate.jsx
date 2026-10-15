import { useAuth } from "./AuthProvider.jsx";
import AuthShell from "./AuthShell.jsx";
import MfaChallengePage from "./MfaChallengePage.jsx";
import MfaEnrolPage from "./MfaEnrolPage.jsx";
import NoAccess from "./NoAccess.jsx";
import SignInPage from "./SignInPage.jsx";

/**
 * Nothing under /admin renders until the person is an admin with a verified second factor.
 * The URL never changes while signing in, so a deep link lands where it was meant to once they are through.
 */
export default function AuthGate({ children }) {
  const { status, retry } = useAuth();
  switch (status) {
    case "ready": return children;
    case "signed_out": return <SignInPage />;
    case "needs_enrol": return <MfaEnrolPage />;
    case "needs_challenge": return <MfaChallengePage />;
    case "no_access": return <NoAccess variant="account" />;
    case "error":
      return (
        <AuthShell title="Could not load" lead="We could not reach the server to check your session.">
          <button type="button" className="button button--primary button--block" onClick={retry}>Try again</button>
        </AuthShell>
      );
    default:
      return <main className="auth-page" aria-busy="true"><p className="auth-help" role="status">Loading…</p></main>;
  }
}
