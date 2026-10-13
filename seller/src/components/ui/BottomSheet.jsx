import { useEffect, useRef, useId } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import IconButton from "./IconButton.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import styles from "./BottomSheet.module.css";

const DISMISS_PX = 96;

export default function BottomSheet({ open, onClose, title, description, children, footer, dismissible = true, size = "md" }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const titleId = useId();
  const descId = useId();
  const desktop = useMediaQuery("(min-width: 768px)");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const canClose = useRef(dismissible);
  canClose.current = dismissible;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      dialog.showModal();
      const target = dialog.querySelector("[data-autofocus]");
      if (target) target.focus();
    }
    if (!open && dialog.open) dialog.close();
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(
    () => () => {
      const dialog = ref.current;
      if (dialog?.open) dialog.close();
    },
    []
  );

  const request = () => {
    if (canClose.current) closeRef.current?.();
  };

  const onPointerDown = (e) => {
    if (desktop || !canClose.current) return;
    drag.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    if (ref.current) ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerEnd = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current = null;
    if (ref.current) ref.current.style.transform = "";
    if (dy > DISMISS_PX) request();
  };

  return (
    <dialog
      ref={ref}
      className={`${styles.sheet} ${styles[size]}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        request();
      }}
      onClick={(e) => e.target === ref.current && request()}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.grab} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
            <span className={styles.handle} aria-hidden="true" />
          </div>
          <div className={styles.head}>
            <div className={styles.headText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description && (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              )}
            </div>
            <IconButton icon={faXmark} label="Close" onClick={request} disabled={!dismissible} />
          </div>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.foot}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
