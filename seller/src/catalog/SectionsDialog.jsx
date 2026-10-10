import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp, faChevronDown, faTrash, faPen } from "@fortawesome/free-solid-svg-icons";
import { LIMITS, planRename, normalizeSectionName } from "@epicmkt/shared";
import { Button, Field, Modal, SelectInput, TextInput } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";
import styles from "./catalog.module.css";

const PROBLEMS = {
  invalid_section_name: `Enter 2 to ${LIMITS.section} characters`,
  section_not_found: "That section no longer exists. Your list has been refreshed.",
  invalid_move_target: "Choose a different section to move the items to",
};
const count = (n) => `${n} ${n === 1 ? "item" : "items"}`;

export function SectionsDialog({ open, onClose, catalog }) {
  const { sections, rows } = catalog;
  const push = useToasts((s) => s.push);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [renaming, setRenaming] = useState(null); // { name, value, problem }
  const [removing, setRemoving] = useState(null); // { name, moveTo, problem }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [focusAfter, setFocusAfter] = useState(null);
  const buttons = useRef({});
  const listRef = useRef(null);

  const used = (s) => rows.filter((r) => (r.item.section ?? "").toLowerCase() === s.toLowerCase()).length;

  useEffect(() => {
    if (!open) { setRenaming(null); setRemoving(null); setMessage(""); setProblem(""); }
  }, [open]);

  // Put focus back where the person was working once the row re-renders.
  useEffect(() => {
    if (focusAfter === "list") listRef.current?.focus();
    else if (focusAfter) buttons.current[`rename:${focusAfter}`]?.focus();
    if (focusAfter) setFocusAfter(null);
  }, [focusAfter, sections]);

  const run = async (next) => {
    try { await catalog.saveSections(next); } catch { push({ message: "Could not save your sections. Try again.", tone: "error" }); }
  };

  const add = async () => {
    const clean = normalizeSectionName(name);
    if (clean.length < 2) return setProblem("Enter at least 2 characters");
    if (clean.length > LIMITS.section) return setProblem(`Up to ${LIMITS.section} characters`);
    if (sections.some((s) => s.toLowerCase() === clean.toLowerCase())) return setProblem("You already have a section with that name");
    if (sections.length >= LIMITS.sections) return setProblem(`You can have up to ${LIMITS.sections} sections`);
    setProblem("");
    setName("");
    await run([...sections, clean]);
  };

  const shift = (i, d) => { const next = [...sections]; [next[i], next[i + d]] = [next[i + d], next[i]]; run(next); };

  // Live preview while typing a new name: say so before two sections are merged.
  const preview = useMemo(() => {
    if (!renaming) return null;
    try { return planRename(sections, renaming.name, renaming.value); } catch { return null; }
  }, [renaming, sections]);

  const startRename = (s) => { setRemoving(null); setMessage(""); setRenaming({ name: s, value: s, problem: "" }); };
  const cancelRename = () => { const n = renaming?.name; setRenaming(null); setFocusAfter(n ?? null); };

  const saveRename = async () => {
    if (!renaming || busy) return;
    const target = normalizeSectionName(renaming.value);
    if (target.length < 2 || target.length > LIMITS.section) return setRenaming({ ...renaming, problem: PROBLEMS.invalid_section_name });
    if (target === renaming.name) return cancelRename();
    setBusy(true);
    try {
      const out = await catalog.renameSection(renaming.name, target);
      const final = preview?.merged ? preview.rewrite.to : target;
      setMessage(out.merged
        ? `Merged “${renaming.name}” into “${final}”. ${count(out.moved)} moved.`
        : `Renamed “${renaming.name}” to “${final}”. ${count(out.moved)} updated.`);
      setRenaming(null);
      setFocusAfter(final);
    } catch (e) {
      if (e?.code === "section_not_found") catalog.refresh();
      setRenaming((r) => r && { ...r, problem: PROBLEMS[e?.code] ?? "Could not rename the section. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const startRemove = (s) => { setRenaming(null); setMessage(""); setRemoving({ name: s, moveTo: "", problem: "" }); };
  const cancelRemove = () => { setRemoving(null); setFocusAfter("list"); };

  const confirmRemove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    const n = used(removing.name);
    try {
      const out = await catalog.removeSection(removing.name, removing.moveTo || null);
      setMessage(
        n === 0 ? `Removed “${removing.name}”.`
          : removing.moveTo ? `Removed “${removing.name}”. ${count(out.moved)} moved to “${removing.moveTo}”.`
          : `Removed “${removing.name}”. ${count(out.moved)} ${out.moved === 1 ? "now has" : "now have"} no section.`
      );
      setRemoving(null);
      setFocusAfter("list");
    } catch (e) {
      if (e?.code === "section_not_found") catalog.refresh();
      setRemoving((r) => r && { ...r, problem: PROBLEMS[e?.code] ?? "Could not remove the section. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Sections" actions={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className={styles.muted}>Sections group your items on your page, in this order.</p>
      <p role="status" aria-live="polite" className={styles.sectionStatus}>{message}</p>
      <div ref={listRef} tabIndex={-1} className={styles.sectionListWrap}>
        {sections.length === 0 ? <p>No sections yet.</p> : (
          <ol className={styles.sectionList} aria-label="Your sections">
            {sections.map((s, i) => (
              <li key={s} className={styles.sectionRow}>
                {renaming?.name === s ? (
                  <div className={styles.sectionEdit}>
                    <Field label={`New name for ${s}`} error={renaming.problem} hint={preview?.merged ? `“${preview.rewrite.to}” already exists. Items in “${s}” will move into it.` : undefined}>
                      {(p) => (
                        <TextInput {...p} value={renaming.value} maxLength={LIMITS.section + 10} autoFocus
                          onChange={(value) => setRenaming({ ...renaming, value, problem: "" })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveRename(); }
                            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelRename(); }
                          }} />
                      )}
                    </Field>
                    <div className={styles.sectionEditActions}>
                      <Button variant="primary" onClick={saveRename} disabled={busy}>{preview?.merged ? "Merge" : "Save"}</Button>
                      <Button onClick={cancelRename} disabled={busy}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className={styles.sectionName}>{s} <span className={styles.muted}>({count(used(s))})</span></span>
                    <button type="button" className={styles.miniBtn} ref={(el) => { buttons.current[`rename:${s}`] = el; }} aria-label={`Rename ${s}`} onClick={() => startRename(s)}><FontAwesomeIcon icon={faPen} /></button>
                    <button type="button" className={styles.miniBtn} aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => shift(i, -1)}><FontAwesomeIcon icon={faChevronUp} /></button>
                    <button type="button" className={styles.miniBtn} aria-label={`Move ${s} down`} disabled={i === sections.length - 1} onClick={() => shift(i, 1)}><FontAwesomeIcon icon={faChevronDown} /></button>
                    <button type="button" className={styles.miniBtn} aria-label={`Remove ${s}`} onClick={() => startRemove(s)}><FontAwesomeIcon icon={faTrash} /></button>
                  </>
                )}
                {removing?.name === s && (
                  <div className={styles.removeConfirm} role="group" aria-label={`Remove ${s}`} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelRemove(); } }}>
                    {used(s) > 0 ? (
                      <Field label={`Move ${count(used(s))} to:`} error={removing.problem}>
                        {(p) => (
                          <SelectInput {...p} autoFocus value={removing.moveTo} onChange={(moveTo) => setRemoving({ ...removing, moveTo, problem: "" })}
                            options={[{ value: "", label: "No section" }, ...sections.filter((x) => x !== s).map((x) => ({ value: x, label: x }))]} />
                        )}
                      </Field>
                    ) : (
                      <p>No items use “{s}”.{removing.problem && <span role="alert" className={styles.errorText}> {removing.problem}</span>}</p>
                    )}
                    <div className={styles.sectionEditActions}>
                      <Button variant="danger" onClick={confirmRemove} disabled={busy}>Remove section</Button>
                      <Button autoFocus={used(s) === 0} onClick={cancelRemove} disabled={busy}>Cancel</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className={styles.inlineAdd}>
        <Field label="New section" error={problem}>
          {(p) => <TextInput {...p} value={name} maxLength={LIMITS.section} onChange={setName} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />}
        </Field>
        <Button onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}
