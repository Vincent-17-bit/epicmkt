import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Works with <BrowserRouter> (useBlocker needs a data router). While `dirty`:
// closing or refreshing the tab asks the browser to confirm, and clicking an in-app link
// to another page is held until the person chooses to leave or stay.
export function useUnsavedGuard(dirty) {
  const navigate = useNavigate();
  const [pendingTo, setPendingTo] = useState(null);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingTo(a.pathname + a.search + a.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const proceed = useCallback(() => {
    const to = pendingTo;
    setPendingTo(null);
    if (to) navigate(to);
  }, [pendingTo, navigate]);
  const stay = useCallback(() => setPendingTo(null), []);
  return { blocked: pendingTo !== null, proceed, stay };
}
