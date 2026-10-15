import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx.js";
import { IconButton } from "./IconButton.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./Dialog.module.css";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const isVisible = (el) => !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true";
const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(isVisible);

// Open dialogs, newest last. Only the top one handles Escape and Tab.
const stack = [];
let scrollLocks = 0;
let savedOverflow = "";
const inerted = new Set(); // elements we made inert, restored when the last dialog closes (ones already inert are left alone)

function lockPage(portalRoot) {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  // Everything behind the dialog becomes inert so keyboard and screen readers cannot reach it.
  // Dialog portals and the toast region stay live (toasts carry Undo).
  for (const el of document.body.children) {
    if (el === portalRoot || el.hasAttribute("data-dialog-root") || el.hasAttribute("data-toast-region")) continue;
    if (el.hasAttribute("inert")) continue;
    el.setAttribute("inert", "");
    inerted.add(el);
  }
}

function unlockPage() {
  if (--scrollLocks > 0) return;
  scrollLocks = 0;
  document.body.style.overflow = savedOverflow;
  for (const el of inerted) el.removeAttribute("inert");
  inerted.clear();
}

/**
 * The accessible dialog behind Modal and Drawer. Rendered in a portal.
 * - role="dialog" aria-modal, labelled by the title
 * - focus moves in on open (to [data-autofocus], else the first control, else the dialog itself),
 *   Tab and Shift+Tab stay inside, and focus returns to the opener on close, or to `returnFocusRef`
 *   when the opener is gone (for example a row that was just deleted)
 * - Escape and a click on the scrim close it unless `dismissible` is false
 * - the page behind is inert and does not scroll
 * - `theme` ("light" | "dark") pins the dialog's theme; leave it out to follow the page
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  side = "right",
  size = "md",
  dismissible = true,
  showClose = true,
  returnFocusRef,
  initialFocusRef,
  role = "dialog",
  theme,
  className,
}) {
  const panelRef = useRef(null);
  const portalRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry = { panel };
    stack.push(entry);
    lockPage(portalRef.current);

    const initial = initialFocusRef?.current ?? panel.querySelector("[data-autofocus]") ?? focusables(panel)[0] ?? panel;
    initial.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      if (stack[stack.length - 1] !== entry) return;
      if (event.key === "Escape") {
        if (dismissibleRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current?.("escape");
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      stack.splice(stack.indexOf(entry), 1);
      unlockPage();
      const target = opener && opener.isConnected ? opener : returnFocusRef?.current;
      if (target && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef, returnFocusRef]);

  if (!open) return null;

  return createPortal(
    <div ref={portalRef} data-dialog-root="" data-theme={theme} className={styles.root}>
      <div className={styles.scrim} onClick={() => dismissible && onClose?.("scrim")} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(styles.panel, variant === "drawer" ? [styles.drawer, styles[`side-${side}`]] : [styles.modal, styles[`size-${size}`]], className)}
      >
        <header className={styles.header}>
          <div className={styles.headings}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            {description ? <p id={descId} className={styles.description}>{description}</p> : null}
          </div>
          {showClose && dismissible ? (
            <IconButton aria-label="Close" size="sm" icon={<FontAwesomeIcon icon={faXmark} />} onClick={() => onClose?.("button")} />
          ) : null}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
