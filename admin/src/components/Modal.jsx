import { useId, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { createPortal } from "react-dom";

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;

  useFocusTrap(ref, true, { onEscape: () => closeRef.current() });

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="modal__title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
