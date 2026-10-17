import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

export default function LeaveDialog({ title = "Leave without saving?", message = "You have unsaved changes. Leaving discards them.", leaveLabel = "Leave", onLeave, onStay }) {
  return (
    <Modal title={title} onClose={onStay}>
      <p className="modal__summary">{message}</p>
      <div className="modal__footer">
        <Button onClick={onStay}>Keep editing</Button>
        <Button variant="primary" className="admin-button--danger" onClick={onLeave}>
          {leaveLabel}
        </Button>
      </div>
    </Modal>
  );
}
