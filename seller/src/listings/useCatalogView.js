import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readCatalogView, writeCatalogView } from "@epicmkt/shared";
import { readStore, writeStore } from "../lib/storage.js";
import { useSettings } from "../state/settings.js";

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

  // The card view is remembered on this device and, when "Remember my catalog view" is on, in the seller's settings.
  const saved = useSettings((st) => (st.loaded && st.settings.appearance.remember_card_view ? st.settings.appearance.card_view : null));
  const [mode, setModeState] = useState(() => (MODES.includes(readStore(MODE_KEY)) ? readStore(MODE_KEY) : "comfortable"));
  useEffect(() => {
    if (saved && MODES.includes(saved)) setModeState(saved);
  }, [saved]);
  const setMode = useCallback((next) => {
    setModeState(next);
    writeStore(MODE_KEY, next);
    const st = useSettings.getState();
    if (st.loaded && st.settings.appearance.remember_card_view && st.settings.appearance.card_view !== next) st.update({ appearance: { card_view: next } }, { quiet: true });
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
