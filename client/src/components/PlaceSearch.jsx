import { useEffect, useId, useRef, useState } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { matchTowns, mergePlaces, searchPlaces } from "../lib/places.js";
import styles from "./PlaceSearch.module.css";

const DELAY_MS = 250;

/** A search box for any Kenyan area or town: type, pick from the list (arrow keys and Enter work). `onPick({ name, lat, lng })` gets the choice. */
export default function PlaceSearch({ label, placeholder, onPick, near = null, search = searchPlaces, delay = DELAY_MS }) {
  const id = useId();
  const [text, setText] = useState("");
  const [remote, setRemote] = useState([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const run = useRef(0);
  const inputRef = useRef(null);

  const query = text.trim();
  const items = query.length >= 2 || (query.length === 1 && matchTowns(query).length) ? mergePlaces(matchTowns(query), remote) : [];

  useEffect(() => {
    const mine = ++run.current;
    setRemote([]);
    if (query.length < 2) {
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      const found = await search(query, { signal: ctl.signal, near });
      if (mine !== run.current) return;
      setRemote(found);
      setBusy(false);
    }, delay);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, search, delay, near?.lat, near?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(-1), [query, remote]);

  const pick = (place) => {
    if (!place) return;
    onPick({ name: place.label, lat: place.lat, lng: place.lng });
    setText("");
    setOpen(false);
  };

  const onKey = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (event.key === "Enter") {
      if (open && items.length) {
        event.preventDefault();
        pick(items[active >= 0 ? active : 0]);
      }
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    }
  };

  const listed = open && items.length > 0;
  const none = query.length >= 2 && !busy && items.length === 0;
  const status = busy && !items.length ? "Searching" : none ? "No place found. Try the nearest town." : items.length ? `${items.length} place${items.length === 1 ? "" : "s"} found` : "";

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={`${id}-input`}>{label}</label>
      <div className={styles.box}>
        <input
          id={`${id}-input`}
          ref={inputRef}
          className={styles.input}
          type="text"
          inputMode="search"
          role="combobox"
          aria-expanded={listed}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={listed && active >= 0 ? `${id}-o${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={text}
          maxLength={80}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {text && (
          <button type="button" className={styles.clear} aria-label="Clear" onClick={() => { setText(""); setOpen(false); inputRef.current?.focus(); }}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul id={`${id}-list`} className={styles.list} role="listbox" aria-label={label} hidden={!listed}>
        {items.map((p, i) => (
          <li key={`${p.label}-${p.lat}`} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={styles.option} data-active={i === active ? "" : undefined}
            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
            <span className={styles.main}>
              <span className={styles.name}>{p.name}</span>
              {p.kind && p.kind !== "town" && <span className={styles.kind}>{p.kind}</span>}
            </span>
            {p.label !== p.name && <span className={styles.context}>{p.label.slice(p.name.length + 2)}</span>}
          </li>
        ))}
      </ul>
      {none && open ? <p className={styles.empty} role="status">{status}</p> : <p className={styles.sr} role="status" aria-live="polite">{status}</p>}
    </div>
  );
}
