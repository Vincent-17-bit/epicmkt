import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../pages/business/catalog/Modal.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./shopPhotos.module.css";

// The little menu that opens from the camera badge: take a new picture, or pick one that is already on the phone.
// Remove only shows when there is a picture to remove, and asks once more before it deletes anything.
//
// The caller's handlers must start the file picker straight away (inside the tap). Browsers only allow a picker or the
// camera to open from a real tap, so nothing here waits or awaits before calling them.
export default function PhotoSourceSheet({ spec, hasImage, canCamera, onCamera, onGallery, onRemove, onClose }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [spec]);
  const what = spec?.kind === "logo" ? "shop logo" : "cover photo";

  return (
    <Modal open={Boolean(spec)} onClose={onClose} title={spec?.title ?? ""} labelId="photo-source-title" sheet>
      {spec && (confirming ? (
        <div className={styles.confirm}>
          <p>Remove your {what}? Customers will see the default picture instead.</p>
          <div className={styles.confirmActions}>
            <button type="button" className={ui.btn} onClick={onRemove}>Remove {what}</button>
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <ul className={styles.options}>
          {canCamera && (
            <li>
              <button type="button" className={styles.option} onClick={onCamera}>
                <span className={styles.optionIcon}><FontAwesomeIcon icon={faCamera} aria-hidden="true" /></span>
                <span>Camera</span>
              </button>
            </li>
          )}
          <li>
            <button type="button" className={styles.option} onClick={onGallery}>
              <span className={styles.optionIcon}><FontAwesomeIcon icon={faImage} aria-hidden="true" /></span>
              <span>Photo</span>
            </button>
          </li>
          {hasImage && (
            <li>
              <button type="button" className={`${styles.option} ${styles.optionDanger}`} onClick={() => setConfirming(true)}>
                <span className={styles.optionIcon}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></span>
                <span>Remove</span>
              </button>
            </li>
          )}
        </ul>
      ))}
    </Modal>
  );
}
