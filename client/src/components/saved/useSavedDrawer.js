import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const SAVED_ID = "saved-drawer";
export const SAVED_PATH = "/saved";

// The Saved drawer opens through history state, as the menu and search do: Back closes it. /saved is the home page with it open (links, an
// app shortcut); closing it there goes to / with replace.
export function useSavedDrawer() {
  const location = useLocation();
  const navigate = useNavigate();
  const onRoute = location.pathname === SAVED_PATH;
  const isOpen = onRoute || Boolean(location.state?.saved);
  const { pathname, search, hash, state } = location;

  const open = useCallback(() => {
    if (isOpen) return;
    // From the menu: replace the menu's entry, so Back does not bring the menu back. Saved, menu and search are never open together.
    navigate({ pathname, search, hash }, { state: { saved: true }, replace: Boolean(state?.menu || state?.search) });
  }, [isOpen, navigate, pathname, search, hash, state]);

  const close = useCallback(() => {
    if (onRoute) navigate("/", { replace: true });
    else if (state?.saved) navigate(-1);
  }, [onRoute, state, navigate]);

  // Leave the drawer and go somewhere: replaces the drawer's entry, so Back returns to where the buyer was. The same page just closes.
  const goTo = useCallback(
    (to) => {
      const here = `${pathname}${search}`;
      if (to === here && !onRoute) {
        close();
        return;
      }
      navigate(to, { replace: true });
    },
    [pathname, search, onRoute, close, navigate]
  );

  return { isOpen, open, close, goTo };
}
