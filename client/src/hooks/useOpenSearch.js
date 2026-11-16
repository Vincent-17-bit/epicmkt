import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Opens the search panel on its own, over the page the visitor is on. The menu's search box opens it with the menu behind it
// (Header.jsx), so closing search there returns to the menu; from anywhere else (the home page search bar, the end of the
// product list) closing it returns straight to the page. Back closes it either way, because opening is a history entry.
export function useOpenSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.state?.search) return;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { state: { search: true } });
  }, [navigate, location.pathname, location.search, location.hash, location.state]);
}
