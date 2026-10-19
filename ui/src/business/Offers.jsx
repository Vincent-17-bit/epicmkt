import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./Offers.module.css";

export default function Offers({ offers, formatExpiry }) {
  return (
    <BusinessSection title="Offers" id="offers">
      <ul className={styles.offers}>
        {offers.map((offer) => (
          <li key={offer.id} className={styles.offer}>
            <FontAwesomeIcon icon={faTag} className={styles.offerIcon} />
            <div>
              <h3 className={styles.h3}>{offer.title}</h3>
              <p>{offer.description}</p>
              <p className={styles.offerMeta}>
                {formatExpiry?.(offer.expiresAt)}
                {offer.code && (
                  <>
                    {" · Code "}
                    <strong>{offer.code}</strong>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </BusinessSection>
  );
}
