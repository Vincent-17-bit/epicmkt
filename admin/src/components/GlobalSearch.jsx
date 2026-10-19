import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { useDismiss } from "../hooks/useDismiss.js";
import { MIN_QUERY, flatResults, moveActive, toResultGroups } from "../lib/globalSearch.js";
import { describeError } from "../lib/systemStatus.js";

// The header search. Type 2 or more characters to search businesses, items, applications, payments and FAQs
// together; arrow keys move, Enter opens, Escape closes. Press "/" or Ctrl+K anywhere to jump to it.
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const enabled = term.length >= MIN_QUERY;
  const search = useQuery({
    queryKey: ["admin-global-search", term],
    queryFn: () => api.globalSearch(term),
    enabled,
    staleTime: 15_000,
    retry: false,
  });

  const groups = enabled ? toResultGroups(search.data) : [];
  const results = flatResults(groups);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);
  useDismiss(boxRef, open, close);

  // A new search starts at the top; moving to another page closes the list.
  useEffect(() => setActive(-1), [term]);
  useEffect(() => close(), [pathname, close]);

  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(input|textarea|select)$/i.test(event.target?.tagName ?? "") || event.target?.isContentEditable;
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (result) => {
    close();
    setText("");
    setTerm("");
    navigate(result.to);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => moveActive(current, results.length, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      const chosen = results[active] ?? (results.length === 1 ? results[0] : null);
      if (chosen) {
        event.preventDefault();
        go(chosen);
      }
    } else if (event.key === "Escape") {
      if (open) close();
      else setText("");
    }
  };

  const showPanel = open && text.trim().length > 0;
  const status = !enabled
    ? `Type at least ${MIN_QUERY} characters to search`
    : search.isError
      ? null
      : search.isFetching && results.length === 0
        ? "Searching…"
        : results.length === 0
          ? `No results for “${term}”`
          : null;

  return (
    <div className="admin-search" ref={boxRef}>
      <label className="admin-global-search">
        <FontAwesomeIcon icon={search.isFetching && enabled ? faSpinner : faMagnifyingGlass} spin={search.isFetching && enabled} className="admin-global-search__icon" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search everything"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search everything"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {text ? (
          <button type="button" className="admin-global-search__clear" aria-label="Clear search" onClick={() => { setText(""); setTerm(""); inputRef.current?.focus(); }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        ) : (
          <kbd className="admin-global-search__key" aria-hidden="true">/</kbd>
        )}
      </label>

      {showPanel ? (
        <div className="admin-search__panel" id={listId} role="listbox" aria-label="Search results">
          {search.isError ? (
            <div className="admin-search__note" role="alert">
              <strong>Search failed: {describeError(search.error).title}.</strong> {describeError(search.error).cause}
            </div>
          ) : null}
          {status ? <div className="admin-search__note">{status}</div> : null}
          {groups.map((group) => (
            <div key={group.key} role="group" aria-label={group.label}>
              <div className="admin-search__group">{group.label}</div>
              {group.items.map((result) => (
                <button
                  type="button"
                  key={`${group.key}-${result.id}`}
                  id={`${listId}-${result.position}`}
                  role="option"
                  aria-selected={active === result.position}
                  className={`admin-search__result ${active === result.position ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(result.position)}
                  onClick={() => go(result)}
                >
                  <span className="admin-search__title">{result.title}</span>
                  {result.subtitle ? <span className="admin-search__subtitle">{result.subtitle}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
