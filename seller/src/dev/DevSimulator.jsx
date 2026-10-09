import { useEffect, useState } from "react";
import { dev } from "../api/index.js";
import { useSession } from "../state/session.js";
import styles from "./dev.module.css";

const ACTIONS = [
  ["approve", "Approve"],
  ["request_changes", "Request changes"],
  ["reject", "Reject"],
  ["activate", "Confirm payment and Activate"],
  ["expire", "Expire"],
  ["grace", "Grace"],
  ["suspend", "Suspend"],
  ["pause", "Pause"],
  ["reset", "Reset"]
];

export default function DevSimulator() {
  const [open, setOpen] = useState(false);
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [sellers, setSellers] = useState(() => dev?.seededSellers() ?? []);
  const current = me?.business.seller_id;

  useEffect(() => {
    if (open) setSellers(dev.seededSellers());
  }, [open, me]);

  if (!dev) return null;

  const run = async (action) => {
    await dev.simulate(action, current);
    await refresh();
  };

  const switchTo = async (id) => {
    await dev.devSignIn(id);
    await refresh();
  };

  return (
    <aside className={styles.wrap} aria-label="Developer status simulator">
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        DEV
      </button>
      {open && (
        <div className={styles.panel}>
          <label className={styles.field}>
            <span>Seller</span>
            <select value={current ?? ""} onChange={(e) => switchTo(e.target.value)}>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.id} · {s.name} · {s.plan} · {s.status}</option>
              ))}
            </select>
          </label>
          <div className={styles.buttons}>
            {ACTIONS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => run(key)}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
