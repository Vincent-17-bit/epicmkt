import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readCatalogView, writeCatalogView } from "@epicmkt/shared";
import { readStore, writeStore } from "../lib/storage.js";

const MODE_KEY = "epicmkt-seller-listings-mode";
export const MODES = ["comfortable", "compact", "list"];
export const SEARCH_DELAY = 250;

export function useCatalogView() {
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => readCatalogView(params), [params]);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const setView = useCallback(
    (next, options = { replace: true }) => {
      const value = typeof next === "function" ? next(readCatalogView(paramsRef.current)) : next;
      setParams(writeCatalogView(value, paramsRef.current), options);
    },
    [setParams]
  );

  const [mode, setModeState] = useState(() => (MODES.includes(readStore(MODE_KEY)) ? readStore(MODE_KEY) : "comfortable"));
  const setMode = useCallback((next) => {
    setModeState(next);
    writeStore(MODE_KEY, next);
  }, []);

  return { view, setView, params, setParams, mode, setMode };
}

export function useDebouncedSearch(value, commit, delay = SEARCH_DELAY) {
  const [text, setText] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === last.current) return undefined;
    const id = setTimeout(() => {
      last.current = text;
      commit(text);
    }, delay);
    return () => clearTimeout(id);
  }, [text, commit, delay]);

  return [text, setText];
}
