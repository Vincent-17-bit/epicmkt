import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useOverlay } from "../lib/overlay.js";
import Button from "./Button.jsx";

const BODY_FIELDS = ".sheet__body input, .sheet__body select, .sheet__body textarea, .sheet__body button";

/**
 * One overlay primitive: bottom sheet, side slide-over or centered dialog.
 * Children supply `.sheet__body` and (optionally) `.sheet__footer`, so a form
 * can wrap both and keep its submit button in the sticky footer.
 */
export default function Sheet({ title, onClose, placement = "bottom", layer = "sheet", children }) {
  const ref = useRef(null);
  const titleId = useId();

  useOverlay(ref, {
    onClose,
    initialFocus: (node) => node.querySelector(BODY_FIELDS) ?? node.querySelector("button"),
  });

  return createPortal(
    <div className={`sheet-layer sheet-layer--${layer}`}>
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`sheet sheet--${placement}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {placement === "bottom" ? <span className="sheet__grab" aria-hidden="true" /> : null}
        <div className="sheet__header">
          <h2 id={titleId} className="sheet__title">{title}</h2>
          <Button icon={faXmark} className="admin-button--ghost" aria-label="Close" onClick={onClose} />
        </div>
        <div className="sheet__content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
