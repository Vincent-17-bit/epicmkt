import { useEffect, useId, useRef, useState } from "react";
import { departmentOf, groupByDepartment, searchTypes, suggestedTypes } from "../../AddItem.data.js";
import s from "./TypePicker.module.css";

// "What are you adding?": search, "Your shop usually sells" chips, all departments, and "Can't find it?".
// Used by the Add item page (first screen) and by the Type step (change the type later). It only picks; the caller decides what happens next.
//   types, departments   the product types this shop may sell (Contract v1 ProductType[]) and the department list
//   categoryId           the shop's category, so its types are suggested first (never a lock)
//   recentIds            type ids the shop used lately
//   currentId            the type already chosen, if any
//   onPick(type)         a type was chosen
//   onRequestType({name, note}) -> Promise   sends the "Tell us what you sell" request (seller_request_type)
//   onOther({name, note, requested})        the seller goes on as Other goods
export default function TypePicker({ types, departments = [], categoryId, recentIds = [], currentId = null, onPick, onRequestType, onOther, autoFocus = false }) {
  const uid = useId();
  const ids = { search: `${uid}-search`, hint: `${uid}-hint`, status: `${uid}-status`, name: `${uid}-name`, nameErr: `${uid}-name-err`, note: `${uid}-note`, ask: `${uid}-ask` };
  const root = useRef(null);
  const input = useRef(null);
  const nameRef = useRef(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [ask, setAsk] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [nameError, setNameError] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => { if (ask) nameRef.current?.focus(); }, [ask]);

  const query = q.trim();
  const found = searchTypes(types, departments, query);
  const chips = suggestedTypes(types, { categoryId, recentIds });
  const groups = groupByDepartment(types, departments);

  const toggleGroup = (id) => setOpen((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const openAsk = () => { setName((n) => n || query); setAsk(true); };

  // Arrow keys move through the choices; Escape clears the search. Everything is still reachable with Tab.
  const onKeyDown = (e) => {
    const onInput = e.target === input.current;
    const onOption = e.target instanceof HTMLElement && e.target.hasAttribute("data-option");
    if (e.key === "Escape" && onInput && q) { e.preventDefault(); e.stopPropagation(); setQ(""); return; }
    if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || !(onInput || onOption)) return;
    const list = [...(root.current?.querySelectorAll("[data-option]") ?? [])].filter((el) => !el.closest("[hidden]"));
    if (!list.length) return;
    e.preventDefault();
    if (onInput) { if (e.key === "ArrowDown") list[0].focus(); return; }
    const i = list.indexOf(e.target);
    if (e.key === "ArrowUp" && i === 0) input.current?.focus();
    else list[Math.min(list.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  };

  const send = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) { setNameError("Tell us in a few words what you sell."); nameRef.current?.focus(); return; }
    setNameError(""); setFailed(false); setBusy(true);
    try { await onRequestType?.({ name: name.trim(), note: note.trim() }); } catch { setBusy(false); setFailed(true); return; }
    setBusy(false);
    onOther?.({ name: name.trim(), note: note.trim(), requested: true });
  };

  const option = (t, chip = false) => (
    <button type="button" data-option className={chip ? s.chip : s.row} aria-current={t.id === currentId ? "true" : undefined} onClick={() => onPick(t)}>
      <span className={s.name}>{t.name}</span>
      {!chip && <span className={s.dept}>{departmentOf(departments, t.departmentId)}</span>}
    </button>
  );

  return (
    <div ref={root} className={s.picker} onKeyDown={onKeyDown}>
      <label htmlFor={ids.search} className={s.label}>Search for what you sell</label>
      <input
        ref={input} id={ids.search} className={s.search} type="search" value={q} autoComplete="off" enterKeyHint="search" placeholder="Search types"
        aria-describedby={`${ids.hint} ${ids.status}`} onChange={(e) => setQ(e.target.value)}
      />
      <p id={ids.hint} className={s.hint}>Try a word like “bulb”, “perfume” or “A4 paper”.</p>
      <p id={ids.status} role="status" className={query ? s.status : s.sr}>
        {query ? (found.length ? `${found.length} ${found.length === 1 ? "type" : "types"} found` : `No type matches “${query}”`) : ""}
      </p>

      {query ? (
        found.length > 0 && <ul className={s.list} aria-label="Search results">{found.map((t) => <li key={t.id}>{option(t)}</li>)}</ul>
      ) : (
        <>
          {chips.length > 0 && (
            <section aria-labelledby={`${uid}-usual`} className={s.block}>
              <h2 id={`${uid}-usual`} className={s.h}>Your shop usually sells</h2>
              <ul className={s.chips}>{chips.map((t) => <li key={t.id}>{option(t, true)}</li>)}</ul>
            </section>
          )}
          <section aria-labelledby={`${uid}-all`} className={s.block}>
            <h2 id={`${uid}-all`} className={s.h}>All departments</h2>
            <ul className={s.depts}>
              {groups.map((g) => {
                const isOpen = open.has(g.id);
                return (
                  <li key={g.id} className={s.dept2}>
                    <button type="button" className={s.deptBtn} aria-expanded={isOpen} aria-controls={`${uid}-d-${g.id}`} onClick={() => toggleGroup(g.id)}>
                      <span>{g.name}</span><span className={s.count} aria-hidden="true">{g.types.length}</span>
                    </button>
                    <ul id={`${uid}-d-${g.id}`} className={s.list} hidden={!isOpen} aria-label={g.name}>
                      {g.types.map((t) => <li key={t.id}>{option(t)}</li>)}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <section className={s.cant} aria-label="Can't find it?">
        <button type="button" className={s.link} aria-expanded={ask} aria-controls={ids.ask} onClick={() => (ask ? setAsk(false) : openAsk())}>
          Can’t find it? Tell us what you sell
        </button>
        {ask && (
          <form id={ids.ask} className={s.ask} onSubmit={send} noValidate>
            <p className={s.hint}>You can still add your item now as Other goods. We read every request and add the types sellers ask for.</p>
            <label htmlFor={ids.name} className={s.label}>What do you sell?</label>
            <input
              ref={nameRef} id={ids.name} className={s.field} value={name} maxLength={80} autoComplete="off"
              aria-invalid={nameError ? "true" : undefined} aria-describedby={nameError ? ids.nameErr : undefined} onChange={(e) => setName(e.target.value)}
            />
            {nameError && <p id={ids.nameErr} role="alert" className={s.error}>{nameError}</p>}
            <label htmlFor={ids.note} className={s.label}>Anything else we should know? (optional)</label>
            <textarea id={ids.note} className={s.field} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            {failed && <p role="alert" className={s.error}>We could not send that just now. You can still add your item as Other goods.</p>}
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={busy}>{busy ? "Sending" : "Send and add as Other goods"}</button>
              <button type="button" className={s.ghost} disabled={busy} onClick={() => onOther?.({ name: name.trim(), note: note.trim(), requested: false })}>Add as Other goods without sending</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
