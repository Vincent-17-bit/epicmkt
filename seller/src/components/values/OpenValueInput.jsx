import { useEffect, useId, useRef, useState } from "react";
import { MAX_LABEL, cleanValueLabel, normalizeValueKey, validateOpenValue } from "@epicmkt/shared";
import { normaliseResult } from "./source.js";
import { T } from "./text.js";
import ValueChip from "./ValueChip.jsx";
import s from "./values.module.css";

const EMPTY = { matches: [], canAdd: false, addLabel: null, key: null };

// Typed material, colour, brand, finish or flavour, with suggestions from the shared list (ARIA 1.2 combobox with a list popup).
//  - Typing is folded with normalizeValueKey, so "SAMSUNG" finds, and is resolved to, "Samsung".
//  - Nothing matching? "Add “…”" is offered. The new value is usable at once, shown as typed, and flagged "pending review".
//  - Keys: Down/Up move (and wrap), Alt+Down opens, Enter chooses (or adds), Escape closes, then clears.
// value is the dictionary value or null; onChange gets the dictionary value (never bare text).
export default function OpenValueInput({
  kind, label, value = null, onChange, source, id, hint, placeholder, required = false, disabled = false, error,
  addHex = null, blockAdd = "", limit = 8, debounceMs = 150,
}) {
  const uid = useId();
  const ids = { input: id ?? `${uid}-in`, list: `${uid}-list`, label: `${uid}-label`, hint: `${uid}-hint`, status: `${uid}-status`, note: `${uid}-note`, err: `${uid}-err`, pending: `${uid}-pending` };
  const inputRef = useRef(null);
  const changeRef = useRef(null);
  const focusTarget = useRef(null);
  const seq = useRef(0);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [announce, setAnnounce] = useState("");

  const key = normalizeValueKey(text);
  const typed = cleanValueLabel(text);
  const check = typed ? validateOpenValue({ kind, label: typed }) : null;
  const fresh = result.key === key;
  const matches = result.matches; // stay on screen while a newer lookup is on its way
  const exact = key ? matches.find((m) => m.key === key) ?? null : null;
  const resolved = fresh && check?.ok ? exact ?? (!result.canAdd ? matches[0] ?? null : null) : null;
  const showAdd = Boolean(check?.ok) && fresh && !blockAdd && !resolved && result.canAdd && !failed;
  const options = [...matches.map((v) => ({ type: "value", value: v })), ...(showAdd ? [{ type: "add", label: typed }] : [])];
  const showList = open && !value && options.length > 0;
  const localError = typed && check && !check.ok ? (check.error.code === "label_too_long" ? T.tooLong(MAX_LABEL) : T.invalidLabel) : "";
  const dupNote = resolved && resolved.label !== typed ? T.alreadyAs(typed, resolved.label) : "";

  // Look up suggestions while the list is open. A slow answer to an older query is never shown.
  useEffect(() => {
    if (!source || !open || value) return undefined;
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = normaliseResult(await source.search(kind, text, { limit }));
        if (mine !== seq.current) return;
        setResult({ ...r, key });
        setFailed(false);
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, text ? debounceMs : 0);
    return () => { clearTimeout(timer); seq.current += 1; };
  }, [source, open, value, kind, text, key, limit, debounceMs]);

  useEffect(() => { setActive(-1); }, [text]);

  // Keep keyboard focus somewhere sensible when the input is swapped for the chosen value and back.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    (target === "chip" ? changeRef.current : inputRef.current)?.focus();
  }, [value]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${ids.list}-o${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, ids.list]);

  const commit = (v, said) => {
    focusTarget.current = "chip";
    setText(""); setOpen(false); setActive(-1); setResult(EMPTY); setAddError("");
    setAnnounce(said ?? T.chosen(v.label));
    onChange?.(v);
  };

  async function addTyped() {
    if (adding) return;
    setAdding(true); setAddError("");
    try {
      const r = await source.add(kind, typed, addHex ?? null);
      commit(r.value, r.created ? T.added(r.value.label) : T.existing(r.value.label));
    } catch (e) {
      const said = String(e?.code ?? e?.message ?? "");
      setAddError(said.includes("too_many_pending") ? T.tooManyPending : said.includes("label_too_long") ? T.tooLong(MAX_LABEL) : said.includes("invalid_label") ? T.invalidLabel : T.addFailed);
    } finally {
      setAdding(false);
    }
  }

  const pick = (o) => (o.type === "add" ? addTyped() : commit(o.value));

  async function onEnter() {
    if (active >= 0 && options[active]) return pick(options[active]);
    if (!typed || !check?.ok || adding) return undefined;
    let r = fresh ? result : null;
    if (!r) {
      try {
        r = { ...normaliseResult(await source.search(kind, text, { limit })), key };
        setResult(r); setFailed(false);
      } catch { setFailed(true); return undefined; }
    }
    const hit = r.matches.find((m) => m.key === key) ?? (!r.canAdd ? r.matches[0] : null);
    if (hit) return commit(hit);
    if (r.canAdd && !blockAdd) return addTyped();
    return undefined;
  }

  function onKeyDown(e) {
    const n = options.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); if (e.altKey) return; }
      if (n) setActive((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (open || text) { e.preventDefault(); onEnter(); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); }
      else if (text) { e.preventDefault(); e.stopPropagation(); setText(""); }
    }
  }

  function change() {
    focusTarget.current = "input";
    setText(value.label); setAnnounce("");
    onChange?.(null);
  }

  const live = announce
    || (!source ? T.unavailable
      : failed ? T.searchFailed
      : !open || loading ? (loading && open ? T.searching : "")
      : options.length ? T.suggestions(options.length)
      : typed ? (blockAdd ? T.noMatchBlocked(typed) : T.noMatch(typed)) : "");

  const errorText = addError || error || localError || (blockAdd && typed && showAdd === false && !resolved ? blockAdd : "");
  const describedBy = [hint && ids.hint, dupNote && ids.note, errorText && ids.err, ids.status].filter(Boolean).join(" ");

  return (
    <div className={s.wrap} role="group" aria-labelledby={ids.label}>
      {value
        ? <span id={ids.label} className={s.label}>{label}</span>
        : <label id={ids.label} htmlFor={ids.input} className={s.label}>{label}{required && <>{" "}<span className={s.req}>({T.required})</span></>}</label>}
      {hint && <p id={ids.hint} className={s.hint}>{hint}</p>}
      {value ? (
        <>
          <div className={s.selected}>
            <ValueChip value={value} describedBy={value.status === "pending" ? ids.pending : undefined} />
            <button ref={changeRef} type="button" className={s.ghost} disabled={disabled} onClick={change} aria-label={T.changeLabel(label, value.label)}>{T.change}</button>
          </div>
          {value.status === "pending" && <p id={ids.pending} className={s.hint}>{T.pendingNote}</p>}
        </>
      ) : (
        <div className={s.box}>
          <input
            ref={inputRef} id={ids.input} type="text" role="combobox" className={s.input}
            value={text} placeholder={placeholder} disabled={disabled || !source}
            autoComplete="off" autoCapitalize="words" spellCheck="false" enterKeyHint="done"
            aria-expanded={showList} aria-controls={ids.list} aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${ids.list}-o${active}` : undefined}
            aria-required={required || undefined} aria-invalid={errorText ? "true" : undefined} aria-describedby={describedBy}
            onChange={(e) => { setText(e.target.value); setAddError(""); setAnnounce(""); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => { setOpen(false); setActive(-1); }}
            onKeyDown={onKeyDown}
          />
          <ul id={ids.list} role="listbox" aria-label={T.listLabel(label)} className={s.list} hidden={!showList}>
            {options.map((o, i) => (
              <li
                key={o.type === "add" ? "add" : o.value.id} id={`${ids.list}-o${i}`} role="option" aria-selected={i === active}
                className={`${s.option} ${i === active ? s.optionActive : ""}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
              >
                {o.type === "add" ? (
                  <>
                    <span className={s.optionName}>{T.add(o.label)}</span>
                    <span className={s.optionNote}>{addHex ? T.addNoteShade : T.addNote}</span>
                  </>
                ) : (
                  <>
                    <span className={s.optionName}>
                      {o.value.kind === "color" && o.value.hex && <span className={s.dot} style={{ background: o.value.hex }} aria-hidden="true" />}
                      {o.value.label}
                    </span>
                    {o.value.status === "pending" && <span className={s.optionNote}>{T.pendingBadge}</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {dupNote && <p id={ids.note} className={s.hint}>{dupNote}</p>}
      {errorText && <p id={ids.err} role="alert" className={s.error}>{errorText}</p>}
      <p id={ids.status} role="status" className={s.sr}>{live}</p>
    </div>
  );
}
