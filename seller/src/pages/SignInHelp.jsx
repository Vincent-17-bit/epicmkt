import { Link } from "react-router-dom";
import AuthFrame from "../auth/AuthFrame.jsx";
import styles from "../auth/auth.module.css";

export default function SignInHelp() {
  return (
    <AuthFrame title="Sign-in help" footer={<Link to="/login" className={styles.link}>Back to sign in</Link>}>
      <p className={styles.intro}>Your Seller ID looks like ES123456 and arrives with your temporary password after your listing is approved and paid.</p>
      <p className={styles.intro}>Forgot your password? Use Forgot password on the sign-in page. We send a code to the phone number on your listing.</p>
      <p className={styles.intro}>After five wrong attempts, sign-in pauses for 15 minutes.</p>
    </AuthFrame>
  );
}
