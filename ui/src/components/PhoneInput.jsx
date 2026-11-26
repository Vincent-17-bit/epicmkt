import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DEFAULT_COUNTRY, SUGGESTED_COUNTRIES, countryName, dialCodeOf, flagOf, listCountries, parsePhone, searchCountries, splitPhone, toE164 } from "@epicmkt/shared/phone";
import styles from "./PhoneInput.module.css";

/**
 * A phone number for anyone in the world: a country button (flag and dial code) beside the number.
 * The value in and out is one international number, "+254712345678", or "" when blank. An old value written the local way
 * ("0712 345 678") is read for the default country. Typing or pasting "+256..." switches the country by itself.
 *
 * Put the id, aria-invalid and aria-describedby from the surrounding field on it, as for a plain <input>; they land on the number box.
 */
export default function PhoneInput({
  value,
  onChange,
  onBlur,
  defaultCountry = DEFAULT_COUNTRY,
  suggested = SUGGESTED_COUNTRIES,
  inputClassName = "",
  className = "",
  style,
  disabled = false,
  inputRef,
  placeholder,
  name,
  id,
  ...aria
}) {
  const uid = useId();
  const [country, setCountry] = useState(() => splitPhone(value, defaultCountry).country);
  const [text, setText] = useState(() => splitPhone(value, defaultCountry).text);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const emitted = useRef(value ?? "");
  const numberRef = useRef(null);

  // The form changed the value (a reset, a draft loaded, a number filled in from another field): show it.
  useEffect(() => {
    const v = value ?? "";
    if (v === emitted.current) return;
    emitted.current = v;
    const next = splitPhone(v, defaultCountry, country);
    setCountry(next.country);
    setText(next.text);
  }, [value]);

  const emit = useCallback((next) => {
    emitted.current = next;
    onChange?.(next);
  }, [onChange]);

  const typed = (raw) => {
    const cleaned = raw.replace(/[^\d+\s()\-.]/g, "").slice(0, 28);
    // a whole international number typed or pasted: "+256 772 123456" or "00256..." picks Uganda
    if (/^(\+|00)/.test(cleaned.trim())) {
      const p = parsePhone(cleaned, country);
      if (p?.country && p.valid) {
        setCountry(p.country);
        setText(p.national);
        emit(p.e164);
        return;
      }
    }
    setText(cleaned);
    emit(toE164(cleaned, country));
  };

  const pick = (iso) => {
    setCountry(iso);
    setOpen(false);
    emit(toE164(text, iso));
    requestAnimationFrame(() => numberRef.current?.focus());
  };

  const leave = (e) => {
    setTouched(true);
    const p = parsePhone(text, country);
    if (p?.valid) setText(p.national); // tidy: 0712345678 -> 0712 345678
    onBlur?.(e);
  };

  const parsed = parsePhone(text, country);
  const doubt = touched && parsed && !parsed.valid && aria["aria-invalid"] !== true && aria["aria-invalid"] !== "true";
  const hintId = `${uid}-hint`;
  const describedBy = [aria["aria-describedby"], doubt ? hintId : null].filter(Boolean).join(" ") || undefined;
  const dial = dialCodeOf(country);

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")} style={style}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.country}
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={`Country code: ${countryName(country)} ${dial}. Change`}
          data-invalid={aria["aria-invalid"] ? "true" : undefined}
        >
          <span className={styles.flag} aria-hidden="true">{flagOf(country)}</span>
          <span className={styles.dial}>{dial}</span>
          <span className={styles.chev} aria-hidden="true" />
        </button>
        <input
          {...aria}
          aria-describedby={describedBy}
          ref={(el) => {
            numberRef.current = el;
            if (typeof inputRef === "function") inputRef(el);
            else if (inputRef) inputRef.current = el;
          }}
          id={id}
          name={name}
          className={[styles.number, inputClassName].filter(Boolean).join(" ")}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={placeholder ?? "Phone number"}
          value={text}
          disabled={disabled}
          onChange={(e) => typed(e.target.value)}
          onBlur={leave}
        />
      </div>
      {doubt && (
        <p id={hintId} className={styles.hint}>
          That does not look like a valid {countryName(country)} number. Check the digits, or choose another country.
        </p>
      )}
      {open && <CountryPicker current={country} suggested={suggested} onPick={pick} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CountryPicker({ current, suggested, onPick, onClose }) {
  const uid = useId();
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(current);

  const rows = useMemo(() => {
    if (query.trim()) return searchCountries(query).map((c) => ({ ...c, key: `a-${c.iso}` }));
    const all = listCountries();
    const top = suggested.map((iso) => all.find((c) => c.iso === iso)).filter(Boolean);
    return [
      { heading: "Suggested", key: "h-s" },
      ...top.map((c) => ({ ...c, key: `s-${c.iso}` })),
      { heading: "All countries", key: "h-a" },
      ...all.map((c) => ({ ...c, key: `a-${c.iso}` }))
    ];
  }, [query, suggested]);
  // the Suggested rows are shortcuts to countries that are also in the full list; the keyboard walks the full list only
  const options = rows.filter((r) => r.iso && !r.key.startsWith("s-"));

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    document.body.style.overflow = "hidden";
    // on a phone, opening the keyboard at once would hide the list
    if (!window.matchMedia?.("(pointer: coarse)").matches) searchRef.current?.focus();
    // show the Suggested shortcuts first; only jump down when the chosen country is not one of them
    if (!suggested.includes(current)) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "center" });
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (!options.some((o) => o.iso === active)) setActive(options[0]?.iso);
  }, [query]);

  const optionId = (iso) => `${uid}-o-${iso}`;
  const keyboarded = useRef(false); // only follow the highlight once the arrow keys are used, so the list opens at the top
  useEffect(() => {
    if (active && keyboarded.current) listRef.current?.querySelector(`[data-iso="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const move = (step) => {
    if (!options.length) return;
    keyboarded.current = true;
    const i = options.findIndex((o) => o.iso === active);
    setActive(options[(i + step + options.length) % options.length].iso);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (active) onPick(active); }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby={`${uid}-title`}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
    >
      <div className={styles.head}>
        <h2 id={`${uid}-title`} className={styles.title}>Choose a country</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className={styles.search}>
        <input
          ref={searchRef}
          className={styles.searchInput}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={active ? optionId(active) : undefined}
          aria-label="Search countries by name or code"
          placeholder="Search country or code"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <ul ref={listRef} id={`${uid}-list`} className={styles.list} role="listbox" aria-label="Countries">
        {rows.map((r) =>
          r.heading ? (
            <li key={r.key} role="presentation" className={styles.group}>{r.heading}</li>
          ) : (
            <li
              key={r.key}
              id={r.key.startsWith("s-") ? undefined : optionId(r.iso)}
              data-iso={r.key.startsWith("s-") ? undefined : r.iso}
              role="option"
              aria-selected={r.iso === current}
              data-active={r.iso === active && !r.key.startsWith("s-") ? "true" : undefined}
              className={styles.option}
              onClick={() => onPick(r.iso)}
              onMouseMove={() => r.iso !== active && setActive(r.iso)}
            >
              <span className={styles.flag} aria-hidden="true">{r.flag}</span>
              <span className={styles.name}>{r.name}</span>
              <span className={styles.code}>{r.dial}</span>
            </li>
          )
        )}
        {!options.length && <li role="presentation" className={styles.empty}>No country matches &ldquo;{query}&rdquo;.</li>}
      </ul>
    </dialog>
  );
}
