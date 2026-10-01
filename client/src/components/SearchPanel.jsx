import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faXmark,
  faCircleXmark,
  faClockRotateLeft,
  faFire,
  faTableCells,
  faStore,
  faScrewdriverWrench
} from "@fortawesome/free-solid-svg-icons";
import { getSuggestions, getTopSearches, logSearch } from "../api/index.js";
import { addRecent, clearRecent, getRecent, normalizeTerm, removeRecent } from "../lib/recentSearches.js";
import Container from "./Container.jsx";
import IconButton from "./IconButton.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./SearchPanel.module.css";

export const SEARCH_ID = "site-search";

const GROUP_LIMIT = 4;

function Rows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={i} aria-hidden="true">
      <Skeleton height="52px" radius="var(--radius-card)" />
    </li>
  ));
}

function Option({ icon, children, onClick }) {
  return (
    <button type="button" className={styles.option} onClick={onClick}>
      <span className={styles.optionIcon}>{icon}</span>
      <span className={styles.optionName}>{children}</span>
    </button>
  );
}

export default function SearchPanel({ open, onClose, onSelect, panelRef, inputRef }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState(getRecent);
  const normalized = normalizeTerm(term);
  const active = normalized !== "";

  useEffect(() => {
    const id = setTimeout(() => setDebounced(normalized), 250);
    return () => clearTimeout(id);
  }, [normalized]);

  useEffect(() => {
    if (open) setRecent(getRecent());
    else setTerm("");
  }, [open]);

  const top = useQuery({
    queryKey: ["top-searches"],
    queryFn: () => getTopSearches(10),
    enabled: open,
    staleTime: 60_000
  });

  const suggestions = useQuery({
    queryKey: ["suggestions", debounced],
    queryFn: () => getSuggestions(debounced, 40),
    enabled: open && debounced !== "",
    staleTime: 60_000
  });

  const commit = (value) => {
    const clean = normalizeTerm(value);
    if (!clean) return;
    addRecent(clean);
    logSearch(clean);
    onSelect(`/search?q=${encodeURIComponent(clean)}`);
  };

  const submit = (event) => {
    event.preventDefault();
    commit(term);
  };

  const clear = () => {
    setTerm("");
    inputRef.current?.focus();
  };

  const groups = [
    { key: "business", title: "Businesses", icon: faStore },
    { key: "term", title: "Services", icon: faScrewdriverWrench },
    { key: "category", title: "Categories", icon: faTableCells }
  ].map((group) => ({
    ...group,
    items: (suggestions.data ?? []).filter((item) => item.type === group.key).slice(0, GROUP_LIMIT)
  }));

  const settled = active && debounced === normalized && !suggestions.isPending;
  const loading = active && !settled && !suggestions.isError;
  const empty = settled && groups.every((group) => group.items.length === 0);

  const choose = (group, item) => {
    if (group.key === "business") onSelect(`/b/${item.slug}`);
    else if (group.key === "category") onSelect(`/c/${item.categoryId}`);
    else commit(item.label);
  };

  const suggestTo = `/contact?suggest=${encodeURIComponent(normalized)}`;

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
              {term && <IconButton icon={faCircleXmark} label="Clear search" onClick={clear} />}
              <IconButton type="submit" icon={faMagnifyingGlass} label="Search" className={styles.submit} />
            </div>
            <IconButton icon={faXmark} label="Close search" onClick={onClose} />
          </form>

          {active ? (
            <div className={styles.results} aria-live="polite">
              {loading && (
                <ul className={styles.list}>
                  <Rows count={3} />
                </ul>
              )}
              {settled &&
                groups
                  .filter((group) => group.items.length > 0)
                  .map((group) => (
                    <section key={group.key} aria-labelledby={`search-${group.key}`}>
                      <h2 id={`search-${group.key}`} className={styles.label}>
                        {group.title}
                      </h2>
                      <ul className={styles.list}>
                        {group.items.map((item) => (
                          <li key={`${group.key}-${item.label}`}>
                            <Option icon={<FontAwesomeIcon icon={group.icon} />} onClick={() => choose(group, item)}>
                              {item.label}
                            </Option>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
              {empty && (
                <div className={styles.empty}>
                  <p>No results for &ldquo;{normalized}&rdquo;.</p>
                  <Link
                    to={suggestTo}
                    className={styles.suggest}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(suggestTo);
                    }}
                  >
                    Suggest this business/category
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              {recent.length > 0 && (
                <section aria-labelledby="search-recent">
                  <div className={styles.head}>
                    <h2 id="search-recent" className={styles.label}>
                      Recent searches
                    </h2>
                    <button
                      type="button"
                      className={styles.clearAll}
                      onClick={() => setRecent(clearRecent())}
                    >
                      Clear all
                    </button>
                  </div>
                  <ul className={styles.list}>
                    {recent.map((item) => (
                      <li key={item} className={styles.recentRow}>
                        <Option icon={<FontAwesomeIcon icon={faClockRotateLeft} />} onClick={() => commit(item)}>
                          {item}
                        </Option>
                        <IconButton icon={faXmark} label={`Remove ${item}`} onClick={() => setRecent(removeRecent(item))} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(top.isPending || top.data?.length > 0) && (
                <section aria-labelledby="search-top">
                  <h2 id="search-top" className={styles.label}>
                    Top searches
                  </h2>
                  <ol className={styles.list}>
                    {top.isPending ? (
                      <Rows count={5} />
                    ) : (
                      top.data.map((item, index) => (
                        <li key={item.term}>
                          <Option icon={index + 1} onClick={() => commit(item.term)}>
                            {item.term}
                            {index === 0 && <FontAwesomeIcon icon={faFire} className={styles.fire} />}
                          </Option>
                        </li>
                      ))
                    )}
                  </ol>
                </section>
              )}
            </>
          )}
        </Container>
      </div>
    </>
  );
}
