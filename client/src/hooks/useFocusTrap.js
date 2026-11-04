import { useEffect, useRef } from "react";

export const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const FOCUSABLE_WITH_FIELDS = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside a layer while it is open and reports Escape. It wraps Tab and Shift+Tab at the ends only; scroll lock and
 * moving focus in and back out stay with the caller, because each layer does those its own way.
 *
 * - `getContainer`: the element Tab is kept inside. Read on every key press, so it may change while the trap is active.
 * - `onEscape`: called on Escape.
 * - `selector`: which elements count as focusable (visible ones only).
 * - `skipNegativeTabIndex`: also drop matches whose tabIndex is below zero (a `button` with tabindex="-1", say).
 * - `wrapFromOutside`: when focus is outside the container, Tab pulls it back in.
 * - `paused`: return true to leave both keys alone, for example while a native dialog is open on top.
 */
export function useFocusTrap({
  active = true,
  getContainer,
  onEscape,
  selector = FOCUSABLE,
  skipNegativeTabIndex = false,
  wrapFromOutside = false,
  paused
}) {
  const latest = useRef({});
  latest.current = { getContainer, onEscape, selector, skipNegativeTabIndex, wrapFromOutside, paused };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      const options = latest.current;
      if (options.paused?.()) return;
      if (event.key === "Escape") {
        options.onEscape?.(event);
        return;
      }
      if (event.key !== "Tab") return;
      const container = options.getContainer();
      if (!container) return;
      const nodes = [...container.querySelectorAll(options.selector)].filter(
        (node) => node.getClientRects().length > 0 && (!options.skipNegativeTabIndex || node.tabIndex >= 0)
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const stray = options.wrapFromOutside && !container.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || stray)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || stray)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
