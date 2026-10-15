import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { idleState } from "../auth/idle.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

const SHARED_KEY = "epicmkt-admin-last-active"; // lets a second tab count as activity for the first
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];

/**
 * Signs the person out after 15 idle minutes, with a warning two minutes before.
 * Once the warning shows, only the button counts as "still here", so a stray mouse move cannot dismiss it unread.
 */
export default function IdleGuard() {
  const { signOut } = useAuth();
  const last = useRef(Date.now());
  const [state, setState] = useState({ phase: "active", secondsLeft: 0 });
  const dialog = useRef(null);
  const stay = useRef(null);
  const warning = state.phase === "warning";
  useFocusTrap(warning, dialog, stay);

  useEffect(() => {
    let lastShared = 0;
    const touch = () => {
      if (state.phase === "warning") return;
      last.current = Date.now();
      if (last.current - lastShared > 5000) {
        lastShared = last.current;
        try { localStorage.setItem(SHARED_KEY, String(last.current)); } catch { /* ignore */ }
      }
    };
    const onStorage = (event) => {
      if (event.key === SHARED_KEY && event.newValue) last.current = Math.max(last.current, Number(event.newValue));
    };
    const tick = () => {
      const next = idleState(Date.now(), last.current);
      setState((prev) => (prev.phase === next.phase && prev.secondsLeft === next.secondsLeft ? prev : next));
      if (next.phase === "expired") signOut({ reason: "idle" });
    };
    EVENTS.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }));
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", tick); // background tabs throttle timers, so check on return
    const id = setInterval(tick, 1000);
    return () => {
      EVENTS.forEach((name) => window.removeEventListener(name, touch, { capture: true }));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", tick);
      clearInterval(id);
    };
  }, [state.phase, signOut]);

  const stayHere = () => {
    last.current = Date.now();
    try { localStorage.setItem(SHARED_KEY, String(last.current)); } catch { /* ignore */ }
    setState({ phase: "active", secondsLeft: 0 });
  };

  if (!warning) return null;
  const mm = String(Math.floor(state.secondsLeft / 60)).padStart(1, "0");
  const ss = String(state.secondsLeft % 60).padStart(2, "0");
  return (
    <div className="modal">
      <div className="modal__scrim" aria-hidden="true" />
      <div className="modal__box" ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-body">
        <h2 id="idle-title">Still there?</h2>
        <p id="idle-body">For your security you will be signed out in <strong>{mm}:{ss}</strong> because there has been no activity.</p>
        <div className="modal__actions">
          <button type="button" className="button button--primary" ref={stay} onClick={stayHere}>Stay signed in</button>
          <button type="button" className="button" onClick={() => signOut()}>Sign out now</button>
        </div>
      </div>
    </div>
  );
}
