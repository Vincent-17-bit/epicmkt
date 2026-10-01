import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmark, faArrowTrendUp, faTableCells, faStore } from "@fortawesome/free-solid-svg-icons";
import { getSuggestions, getTopSearches, logSearch } from "../api/index.js";
import Container from "./Container.jsx";
import IconButton from "./IconButton.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./SearchPanel.module.css";

export const SEARCH_ID = "site-search";

const suggestionIcon = { category: faTableCells, business: faStore, term: faMagnifyingGlass };

export default function SearchPanel({ open, onClose, onSelect, panelRef, inputRef }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const clean = term.trim();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(clean), 200);
    return () => clearTimeout(id);
  }, [clean]);

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const popular = useQuery({
    queryKey: ["top-searches"],
    queryFn: () => getTopSearches(8),
    enabled: open,
    staleTime: 60_000
  });

  const suggestions = useQuery({
    queryKey: ["suggestions", debounced],
    queryFn: () => getSuggestions(debounced, 6),
    enabled: open && debounced.length >= 2,
    staleTime: 60_000
  });

  const run = (item) => {
    if (item.type === "category") {
      onSelect(`/c/${item.categoryId}`);
      return;
    }
    logSearch(item.label);
    onSelect(`/?q=${encodeURIComponent(item.label)}`);
  };

  const submit = (event) => {
    event.preventDefault();
    if (clean) run({ type: "term", label: clean });
  };

  const typing = clean.length > 0;

  return (
    <>
      <button type="button" tabIndex={-1} aria-hidden="true" data-open={open} className={styles.scrim} onClick={onClose} />
      <div
        id={SEARCH_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        data-open={open}
        inert={open ? undefined : ""}
        aria-hidden={open ? undefined : true}
        className={styles.panel}
      >
        <Container className={styles.inner}>
          <form role="search" className={styles.bar} onSubmit={submit}>
            <div className={styles.search}>
              <label htmlFor="search-input" className={styles.srOnly}>
                Search businesses
              </label>
              <input
                id="search-input"
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search businesses"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className={styles.input}
              />
              <IconButton type="submit" icon={faMagnifyingGlass} label="Search" className={styles.submit} />
            </div>
            <IconButton icon={faXmark} label="Close search" onClick={onClose} />
          </form>

          {typing ? (
            <ul className={styles.list} aria-label="Suggestions">
              <li>
                <button type="button" className={styles.option} onClick={() => run({ type: "term", label: clean })}>
                  <span className={styles.optionIcon}>
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                  </span>
                  <span className={styles.optionName}>Search for &ldquo;{clean}&rdquo;</span>
                </button>
              </li>
              {suggestions.isFetching && !suggestions.data
                ? Array.from({ length: 3 }, (_, i) => (
                    <li key={i} aria-hidden="true">
                      <Skeleton height="52px" radius="var(--radius-card)" />
                    </li>
                  ))
                : (suggestions.data ?? []).map((item) => (
                    <li key={`${item.type}-${item.label}`}>
                      <button type="button" className={styles.option} onClick={() => run(item)}>
                        <span className={styles.optionIcon}>
                          <FontAwesomeIcon icon={suggestionIcon[item.type]} />
                        </span>
                        <span className={styles.optionName}>{item.label}</span>
                        {item.type === "category" && <span className={styles.kind}>Category</span>}
                      </button>
                    </li>
                  ))}
            </ul>
          ) : (
            popular.data?.length > 0 && (
              <section aria-labelledby="search-popular">
                <h2 id="search-popular" className={styles.label}>
                  Popular searches
                </h2>
                <ul className={styles.list}>
                  {popular.data.map((item) => (
                    <li key={item.term}>
                      <button type="button" className={styles.option} onClick={() => run({ type: "term", label: item.term })}>
                        <span className={styles.optionIcon}>
                          <FontAwesomeIcon icon={faArrowTrendUp} />
                        </span>
                        <span className={styles.optionName}>{item.term}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          )}
        </Container>
      </div>
    </>
  );
}
