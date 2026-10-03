import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faPhone, faXmark } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { formatKes, telLink, whatsappLink } from "@epicmkt/shared";
import { logContactEvent } from "../api/index.js";
import Button from "./Button.jsx";
import styles from "./ItemSheet.module.css";

export default function ItemSheet({ business, item, onClose }) {
  const ref = useRef(null);
  const open = Boolean(item);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const track = (type) => () => logContactEvent({ businessId: business.id, type });
  const message = item ? `Hi ${business.name}, I am interested in ${item.name}.` : "";

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby="item-title"
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {item && (
        <div className={styles.body}>
          <header className={styles.header}>
            <nav aria-label="Item" className={styles.trail}>
              <ol className={styles.list}>
                <li className={styles.crumb}>
                  <button type="button" className={styles.parent} onClick={onClose}>
                    <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                    <span className={styles.parentName}>{business.name}</span>
                  </button>
                </li>
                <li className={styles.crumb}>
                  <FontAwesomeIcon icon={faChevronRight} className={styles.sep} aria-hidden="true" />
                  <span className={styles.current} aria-current="page">
                    {item.name}
                  </span>
                </li>
              </ol>
            </nav>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </header>

          {item.imageUrl && <img src={item.imageUrl} alt="" className={styles.image} decoding="async" />}

          <div className={styles.info}>
            <h2 id="item-title" className={styles.title}>
              {item.name}
            </h2>
            {Number.isFinite(item.priceKes) && <p className={styles.price}>{formatKes(item.priceKes)}</p>}
            {item.description && <p>{item.description}</p>}
            <p className={styles.sold}>Sold by {business.name}. Contact the business to order. EpicMKT does not process orders or payments.</p>
          </div>

          <div className={styles.actions}>
            <Button as="a" href={telLink(business.phone)} icon={faPhone} onClick={track("call")}>
              Call
            </Button>
            <Button
              as="a"
              variant="secondary"
              href={whatsappLink(business.whatsapp, message)}
              target="_blank"
              rel="noopener noreferrer"
              icon={faWhatsapp}
              onClick={track("whatsapp")}
            >
              WhatsApp
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
