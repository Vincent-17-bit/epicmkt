import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImages, faVideo } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../pages/business/catalog/Modal.jsx";
import styles from "../shopPhotos/shopPhotos.module.css";

export default function MediaSourceSheet({ open, canPhoto, canVideo, onPhoto, onVideo, onLibrary, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Add photos or videos" labelId="media-source-title" sheet>
      <ul className={styles.options}>
        <li>
          <button type="button" className={styles.option} onClick={onPhoto} disabled={!canPhoto}>
            <span className={styles.optionIcon}><FontAwesomeIcon icon={faCamera} aria-hidden="true" /></span>
            <span>Take photo</span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.option} onClick={onVideo} disabled={!canVideo}>
            <span className={styles.optionIcon}><FontAwesomeIcon icon={faVideo} aria-hidden="true" /></span>
            <span>Record video</span>
          </button>
        </li>
        <li>
          <button type="button" className={styles.option} onClick={onLibrary}>
            <span className={styles.optionIcon}><FontAwesomeIcon icon={faImages} aria-hidden="true" /></span>
            <span>Choose from your files</span>
          </button>
        </li>
      </ul>
    </Modal>
  );
}
