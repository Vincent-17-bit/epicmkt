import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { idleState } from "./idle.js";

export const IDLE_NOTICE_KEY = "admin-idle-notice";
const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchstart"];

// Signs the admin out after 15 minutes without activity, with a warning (and a "Stay signed in" button) at 13.
export default function IdleGuard() {
  const { signOut } = useAuth();
  const last = useRef(Date.now());
  const [state, setState] = useState({ phase: "active", secondsLeft: 0 });

  useEffect(() => {
    const touch = () => {
      // Once the warning shows, only the button counts: a stray mouse move should not hide a real countdown.
      if (idleState(Date.now(), last.current).phase === "active") last.current = Date.now();
    };
    ACTIVITY.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const timer = setInterval(() => {
      const next = idleState(Date.now(), last.current);
      setState(next);
      if (next.phase === "expired") {
        clearInterval(timer);
        try {
          sessionStorage.setItem(IDLE_NOTICE_KEY, "You were signed out after 15 minutes without activity.");
        } catch {
          /* private mode: the notice is a courtesy */
        }
        signOut();
      }
    }, 1000);
    return () => {
      ACTIVITY.forEach((name) => window.removeEventListener(name, touch));
      clearInterval(timer);
    };
  }, [signOut]);

  if (state.phase !== "warning") return null;
  const minutes = Math.floor(state.secondsLeft / 60);
  const seconds = String(state.secondsLeft % 60).padStart(2, "0");
  return (
    <div className="admin-idle" role="alertdialog" aria-live="assertive" aria-label="Signing out soon">
      <p>You will be signed out in {minutes}:{seconds} because you have not been active.</p>
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          last.current = Date.now();
          setState({ phase: "active", secondsLeft: 0 });
        }}
      >
        Stay signed in
      </button>
    </div>
  );
}
