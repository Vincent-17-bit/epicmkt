import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/index.js";
import { DEBOUNCE_MS, MIN_CHARS, SCOPES, flattenGroups, isMac, parseQuery, toGroups } from "../lib/search.js";
import { TYPE_LABELS, withPeek } from "../lib/peek.js";
import { splitHighlight } from "../lib/highlight.js";
import { PINNED_KEY, RECENT_KEY, addRecent, isPinned, readList, togglePinned, writeList } from "../lib/palettePrefs.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

function Highlight({ value, term }) {
  return splitHighlight(value, term).map((part, i) => (part.match ? <mark key={i} className="palette__mark">{part.text}</mark> : <span key={i}>{part.text}</span>));
}

const useOnline = () => {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
};

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const online = useOnline();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [raw, setRaw] = useState("");
  const [chip, setChip] = useState("all");
  const [debounced, setDebounced] = useState("");
  const [state, setState] = useState({ status: "idle", result: null, error: null });
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => readList(RECENT_KEY));
  const [pinned, setPinned] = useState(() => readList(PINNED_KEY));
  const [copied, setCopied] = useState("");
  const [retry, setRetry] = useState(0);

  useFocusTrap(rootRef, open);

  const parsed = useMemo(() => parseQuery(debounced, chip), [debounced, chip]);
  const typing = parseQuery(raw, chip);

  useEffect(() => {
    if (!open) return;
    setRaw("");
    setChip("all");
    setDebounced("");
    setState({ status: "idle", result: null, error: null });
    setActive(0);
    setRecent(readList(RECENT_KEY));
    setPinned(readList(PINNED_KEY));
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(raw), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    if (!open) return undefined;
    if (parsed.term.length < MIN_CHARS) {
      setState({ status: "idle", result: null, error: null });
      return undefined;
    }
    if (!online) {
      setState({ status: "offline", result: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    api
      .adminSearch(parsed.term, { scopes: parsed.scope === "all" ? null : [parsed.scope], limit: parsed.scope === "all" ? 5 : 12 })
      .then((result) => !cancelled && setState({ status: "done", result, error: null }))
      .catch((error) => !cancelled && setState({ status: "error", result: null, error }));
    return () => {
      cancelled = true;
    };
  }, [open, parsed.term, parsed.scope, online, retry]);

  const groups = useMemo(() => (state.status === "done" ? toGroups(state.result) : []), [state]);
  const searching = parsed.term.length >= MIN_CHARS;
  const sections = useMemo(() => {
    if (searching) return groups;
    const out = [];
    if (pinned.length) out.push({ key: "pinned", label: "Pinned", rows: pinned });
    const pinnedKeys = new Set(pinned.map((r) => r.key));
    const rest = recent.filter((r) => !pinnedKeys.has(r.key));
    if (rest.length) out.push({ key: "recent", label: "Recent", rows: rest });
    return out;
  }, [searching, groups, pinned, recent]);
  const rows = useMemo(() => flattenGroups(sections), [sections]);

  useEffect(() => setActive(0), [rows.length, parsed.term, parsed.scope]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const remember = useCallback((row) => {
    setRecent((list) => {
      const next = addRecent(list, row);
      writeList(RECENT_KEY, next);
      return next;
    });
  }, []);

  const peekRow = (row) => {
    remember(row);
    setParams(withPeek(params, row.type, row.id));
    onClose();
  };
  const openPage = (row) => {
    remember(row);
    navigate({ pathname: row.pageHref, search: `?${withPeek(new URLSearchParams(), row.type, row.id)}` });
    onClose();
  };
  const copyId = async (row) => {
    try {
      await navigator.clipboard.writeText(row.copy || row.id);
      setCopied(row.key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };
  const pin = (row) => {
    setPinned((list) => {
      const next = togglePinned(list, row);
      writeList(PINNED_KEY, next);
      return next;
    });
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length) setActive((i) => (i + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length) setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      const row = rows[active];
      if (!row) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) openPage(row);
      else peekRow(row);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p" && rows[active]) {
      event.preventDefault();
      pin(rows[active]);
    }
  };

  if (!open) return null;

  const mod = isMac() ? "⌘" : "Ctrl";
  const scopeLabel = SCOPES.find((s) => s.key === typing.scope)?.label ?? "All";
  let flat = -1;

  return (
    <div className="palette" role="presentation">
      <div className="palette__scrim" onClick={onClose} aria-hidden="true" />
      <div ref={rootRef} className="palette__panel" role="dialog" aria-modal="true" aria-label="Search admin" onKeyDown={onKeyDown}>
        <div className="palette__bar">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="palette__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[active] ? `palette-opt-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={`Search ${scopeLabel.toLowerCase()}… (b: i: a: p: f: to scope)`}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <kbd className="palette__kbd">Esc</kbd>
        </div>

        <div className="palette__chips" role="group" aria-label="Search scope">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`palette__chip ${typing.scope === s.key ? "is-on" : ""}`}
              aria-pressed={typing.scope === s.key}
              onClick={() => {
                setChip(s.key);
                setRaw((v) => parseQuery(v, s.key).prefixed ? v.replace(/^\s*[a-zA-Z]:\s*/, "") : v);
                inputRef.current?.focus();
              }}
            >
              {s.label}
              {s.prefix ? <span className="palette__chip-prefix">{s.prefix}:</span> : null}
            </button>
          ))}
        </div>

        <div className="palette__body" id="palette-list" role="listbox" aria-label="Results" ref={listRef}>
          {!online && searching ? (
            <p className="palette__state" role="status">You are offline. Search needs a connection. Pinned and recent items still open.</p>
          ) : null}
          {state.status === "loading" ? <p className="palette__state" role="status">Searching…</p> : null}
          {state.status === "error" ? (
            <div className="palette__state" role="alert">
              {state.error?.code === "42501" ? "Your account is not an admin here, so search is unavailable." : "Search failed."}
              {state.error?.code === "42501" ? null : (
                <button type="button" className="palette__link" onClick={() => setRetry((n) => n + 1)}>Retry</button>
              )}
            </div>
          ) : null}
          {state.status === "done" && !groups.length ? <p className="palette__state" role="status">No results for “{parsed.term}”.</p> : null}
          {!searching && !sections.length ? (
            <p className="palette__state">Type {MIN_CHARS}+ characters to search. Use <code>b:</code> businesses, <code>i:</code> items, <code>a:</code> applications, <code>p:</code> payments, <code>f:</code> FAQs.</p>
          ) : null}

          {sections.map((section) => (
            <div key={section.key} role="group" aria-label={section.label}>
              <div className="palette__group">{section.label}</div>
              {section.rows.map((row) => {
                flat += 1;
                const index = flat;
                const pinnedRow = isPinned(pinned, row);
                return (
                  <div
                    key={`${section.key}-${row.key}`}
                    id={`palette-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === active}
                    className={`palette__row ${index === active ? "is-active" : ""}`}
                    onMouseMove={() => index !== active && setActive(index)}
                    onClick={() => peekRow(row)}
                  >
                    <span className="palette__type">{TYPE_LABELS[row.type]}</span>
                    <span className="palette__text">
                      <span className="palette__title"><Highlight value={row.title} term={parsed.term} /></span>
                      {row.subtitle ? <span className="palette__sub"><Highlight value={row.subtitle} term={parsed.term} /></span> : null}
                    </span>
                    {row.badge ? <span className="palette__badge">{row.badge}</span> : null}
                    <span className="palette__actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" tabIndex={-1} className="palette__action" onClick={() => openPage(row)}>Open page</button>
                      <button type="button" tabIndex={-1} className="palette__action" onClick={() => copyId(row)}>{copied === row.key ? "Copied" : "Copy ID"}</button>
                      <button type="button" tabIndex={-1} className="palette__action" aria-pressed={pinnedRow} onClick={() => pin(row)}>{pinnedRow ? "Unpin" : "Pin"}</button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette__foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> peek</span>
          <span><kbd>{mod}</kbd><kbd>Enter</kbd> open page</span>
          <span><kbd>{mod}</kbd><kbd>P</kbd> pin</span>
        </div>
      </div>
    </div>
  );
}
