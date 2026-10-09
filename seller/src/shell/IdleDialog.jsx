import { Button, Modal } from "@epicmkt/ui";
import styles from "./shell.module.css";

export default function IdleDialog({ open, seconds, onStay, onSignOut }) {
  return (
    <Modal open={open} onClose={onStay} labelledBy="idle-title">
      <div className={styles.idle}>
        <h2 id="idle-title" className={styles.sheetTitle}>Are you still there?</h2>
        <p>You will be signed out in {seconds ?? 0} seconds because of inactivity.</p>
        <div className={styles.idleActions}>
          <Button onClick={onStay}>Stay signed in</Button>
          <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </Modal>
  );
}
