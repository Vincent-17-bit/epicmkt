import { BottomSheet, Button } from "../../components/ui/index.js";

export default function ConfirmSheet({ open, onClose, onConfirm, title, children, confirmLabel, cancelLabel = "Cancel", busy = false, tone = "primary" }) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </BottomSheet>
  );
}
