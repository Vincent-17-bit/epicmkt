import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faChevronDown, faTrash } from "@fortawesome/free-solid-svg-icons";
import { LIMITS } from "@epicmkt/shared";
import { Button, Field, Modal, TextInput } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";
import styles from "./catalog.module.css";

export function SectionsDialog({ open, onClose, catalog }) {
  const { sections, rows } = catalog;
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const push = useToasts((s) => s.push);
  const used = (s) => rows.filter((r) => r.item.section === s).length;

  const run = async (next) => {
    try { await catalog.saveSections(next); } catch { push({ message: "Could not save your sections. Try again.", tone: "error" }); }
  };
  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) return setProblem("Enter at least 2 characters");
    if (clean.length > LIMITS.section) return setProblem(`Up to ${LIMITS.section} characters`);
    if (sections.some((s) => s.toLowerCase() === clean.toLowerCase())) return setProblem("You already have a section with that name");
    if (sections.length >= LIMITS.sections) return setProblem(`You can have up to ${LIMITS.sections} sections`);
    setProblem("");
    setName("");
    await run([...sections, clean]);
  };
  const shift = (i, d) => { const next = [...sections]; [next[i], next[i + d]] = [next[i + d], next[i]]; run(next); };

  return (
    <Modal open={open} onClose={onClose} title="Sections" actions={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className={styles.muted}>Sections group your items on your page, in this order.</p>
      {sections.length === 0 ? <p>No sections yet.</p> : (
        <ol className={styles.sectionList}>
          {sections.map((s, i) => (
            <li key={s}>
              <span className={styles.sectionName}>{s} <span className={styles.muted}>({used(s)} {used(s) === 1 ? "item" : "items"})</span></span>
              <button type="button" className={styles.miniBtn} aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => shift(i, -1)}><FontAwesomeIcon icon={faChevronUp} /></button>
              <button type="button" className={styles.miniBtn} aria-label={`Move ${s} down`} disabled={i === sections.length - 1} onClick={() => shift(i, 1)}><FontAwesomeIcon icon={faChevronDown} /></button>
              <button type="button" className={styles.miniBtn} aria-label={`Remove ${s}`} title={used(s) ? "Move its items to another section first" : "Remove"} disabled={used(s) > 0} onClick={() => run(sections.filter((x) => x !== s))}><FontAwesomeIcon icon={faTrash} /></button>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.inlineAdd}>
        <Field label="New section" error={problem}>
          {(p) => <TextInput {...p} value={name} maxLength={LIMITS.section} onChange={setName} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />}
        </Field>
        <Button onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}
