// A18: a text field that suggests values from the shared dictionary as the seller types (WAI-ARIA combobox, list popup).
// "Mahog" -> Mahogany, Mahogany veneer. When nothing matches exactly the last option is Add "<typed>": the value is usable at once,
// shown exactly as typed, and queued for admin review. onPick(value) gets the dictionary value the seller chose or added; typing again
// afterwards clears it (the parent sees onChange with the new text and valueId null).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as api from "../../../../api/index.js";
import { Counter } from "./parts.jsx";
import styles from "./editor.module.css";

const WAIT_MS = 180;

export default function ValueField({ kind, name, label, hint, error, max, value, valueId, onChange, area, className = "", noun = "value", placeholder, ...control }) {
  const uid = useId();
  const id = `${uid}-${name}`;
  const listId = `${id}-list`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const statusId = `${id}-status`;
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState({ matches: [], canAdd: false, addLabel: null });
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [picked, setPicked] = useState(null);       // the value that was chosen or added, for the "waiting for review" note
  const seq = useRef(0);
  const timer = useRef(null);
  const text = value ?? "";

  const options = [...result.matches.map((m) => ({ type: "match", value: m })), ...(result.canAdd ? [{ type: "add", label: result.addLabel }] : [])];

  const search = useCallback((q) => {
    const mine = ++seq.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.findOptionValues(kind, q);
        if (mine === seq.current) { setResult({ matches: r.matches ?? [], canAdd: !!r.canAdd, addLabel: r.addLabel ?? null }); setActive(-1); }
      } catch {
        if (mine === seq.current) setResult({ matches: [], canAdd: false, addLabel: null });   // typing still works with no suggestions
      }
    }, WAIT_MS);
  }, [kind]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const type = (e) => {
    setPicked(null);
    setProblem("");
    onChange(e.target.value, null);
    setOpen(true);
    search(e.target.value);
  };

  const choose = async (opt) => {
    if (!opt) return;
    setProblem("");
    if (opt.type === "match") {
      setPicked(opt.value);
      onChange(opt.value.label, opt.value);
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const { value: v } = await api.addOptionValue(kind, opt.label);
      setPicked(v);
      onChange(v.label, v);
      setOpen(false);
    } catch (err) {
      setProblem(err?.code === "too_many_pending" ? "You have many new values waiting for review. Pick one from the list for now." : `That ${noun} could not be added. You can still keep what you typed.`);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); search(text); return; }
      if (options.length) setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (open && options.length) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && options[active]) { e.preventDefault(); choose(options[active]); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); }
    }
  };

  const show = open && options.length > 0;
  const optId = (i) => `${id}-opt-${i}`;
  const count = options.length;
  const announce = !open ? "" : count === 0 ? "No suggestions" : `${count} ${count === 1 ? "suggestion" : "suggestions"}`;
  const pending = picked && picked.status === "pending" && picked.label === text;

  return (
    <div className={`${styles.field} ${className}`} data-area={area}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.valueWrap}>
        <input
          id={id}
          className={styles.input}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && active >= 0 ? optId(active) : undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={[hintId, errId, statusId].filter(Boolean).join(" ")}
          data-focus={name}
          data-value-id={valueId ?? undefined}
          autoComplete="off"
          maxLength={max}
          placeholder={placeholder}
          value={text}
          onChange={type}
          onFocus={() => { setOpen(true); search(text); }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          {...control}
        />
        {show && (
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className={styles.valueList}>
            {options.map((o, i) => (
              <li
                key={o.type === "add" ? "add" : o.value.id}
                id={optId(i)}
                role="option"
                aria-selected={i === active}
                data-active={i === active ? "true" : undefined}
                className={styles.valueOption}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                {o.type === "add" ? <span>Add “{o.label}”</span> : (
                  <span>{o.value.label}{o.value.status === "pending" && <span className={styles.valueTag}> new</span>}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={statusId} className={styles.sr} role="status" aria-live="polite">{busy ? "Adding" : announce}</p>
      <div className={styles.noteRow}>
        {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
        {max && <Counter length={text.length} max={max} />}
      </div>
      {pending && <p className={styles.valueNote} data-testid={`${name}-pending`}>New {noun}. It works now and our team will review it.</p>}
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {error && <p id={errId} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
