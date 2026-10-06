import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { devTools } from "../../../api/applications/index.js";
import styles from "./simulator.module.css";

const PATHS = [
  "owner.fullName", "owner.idNumber", "phone", "email", "business.name", "business.sbpNumber", "business.sbpExpiry",
  "location.address", "contacts.whatsapp", "documents.owner_id_front", "documents.owner_id_back", "documents.sbp", "documents.signboard"
];

export default function AdminSimulator() {
  const qc = useQueryClient();
  const [tools, setTools] = useState(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [ref, setRef] = useState("");
  const [path, setPath] = useState(PATHS[0]);
  const [text, setText] = useState("");

  useEffect(() => {
    devTools?.().then(setTools);
  }, []);

  const reload = useCallback(() => {
    if (!tools) return;
    const next = tools.simList();
    setList(next);
    setRef((cur) => (next.some((a) => a.referenceNo === cur) ? cur : next[0]?.referenceNo ?? ""));
    qc.invalidateQueries({ queryKey: ["status-app"] });
  }, [tools, qc]);

  useEffect(reload, [reload, open]);

  if (!tools) return null;
  const current = list.find((a) => a.referenceNo === ref);
  const run = (fn) => () => {
    fn();
    reload();
  };

  return (
    <aside className={styles.panel} aria-label="Admin simulator (development only)">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Admin simulator
      </button>
      {open && (
        <div className={styles.body}>
          <button type="button" onClick={run(() => tools.simSeed())}>Load demo data</button>
          <label>
            Application
            <select value={ref} onChange={(e) => setRef(e.target.value)}>
              {list.map((a) => (
                <option key={a.referenceNo} value={a.referenceNo}>{a.referenceNo} ({a.status})</option>
              ))}
            </select>
          </label>
          {ref && (
            <>
              <div className={styles.grid}>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "under_review"))}>Under review</button>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "changes_requested", { note: text || undefined }))}>Request changes</button>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "approved", { note: text || undefined }))}>Approve</button>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "rejected", { reason: text || "Not eligible" }))}>Reject</button>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "payment_confirming", { paymentConfirmed: true }))}>Confirm payment</button>
                <button type="button" onClick={run(() => tools.simSetStatus(ref, "activated"))}>Activate</button>
              </div>
              <label>
                Message, note or reason
                <input value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <button type="button" onClick={run(() => tools.simNote(ref, text))}>Add note</button>
              <label>
                Flag a field or document
                <select value={path} onChange={(e) => setPath(e.target.value)}>
                  {PATHS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <button type="button" onClick={run(() => tools.simFlag(ref, path, text || "Please correct this."))}>Flag it</button>
              {current?.flags.filter((f) => f.status !== "confirmed").map((f) => (
                <button key={f.id} type="button" onClick={run(() => tools.simConfirmFlag(ref, f.id))}>
                  Confirm fix: {f.path}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
