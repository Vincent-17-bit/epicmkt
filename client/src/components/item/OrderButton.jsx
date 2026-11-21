import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { t } from "../../i18n/index.js";
import { external } from "./links.js";
import frame from "../ItemDetail.module.css";
import styles from "./OrderButton.module.css";

export default function OrderButton({ ctx }) {
  const { orderHref, onChat } = ctx;
  if (!orderHref) return null;
  return (
    <div className={styles.root}>
      <a href={orderHref} {...external} className={frame.chat} data-testid="order-whatsapp" onClick={onChat("order")}>
        <FontAwesomeIcon icon={faWhatsapp} className={frame.icon} aria-hidden="true" />
        <span>{t("item.orderWhatsapp")}</span>
      </a>
    </div>
  );
}
