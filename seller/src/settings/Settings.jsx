import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faClock, faComment, faDatabase, faLocationDot, faPalette, faShieldHalved, faTags, faTruck } from "@fortawesome/free-solid-svg-icons";
import ShopLocation from "./ShopLocation.jsx";
import ShopDelivery from "./ShopDelivery.jsx";
import HoursEditor from "./HoursEditor.jsx";
import AccountSecurity from "./AccountSecurity.jsx";
import NotificationPrefs from "./NotificationPrefs.jsx";
import AppearancePrefs from "./AppearancePrefs.jsx";
import CatalogDefaults from "./CatalogDefaults.jsx";
import MessagingDefaults from "./MessagingDefaults.jsx";
import DataAccount from "./DataAccount.jsx";
import ui from "../styles/ui.module.css";
import styles from "./settings.module.css";

const SECTIONS = [
  { id: "location", label: "Shop location", icon: faLocationDot, Panel: ShopLocation },
  { id: "delivery", label: "Delivery", icon: faTruck, Panel: ShopDelivery },
  { id: "hours", label: "Opening hours", icon: faClock, Panel: HoursEditor },
  { id: "account", label: "Account and security", icon: faShieldHalved, Panel: AccountSecurity },
  { id: "notifications", label: "Notifications", icon: faBell, Panel: NotificationPrefs },
  { id: "appearance", label: "Appearance", icon: faPalette, Panel: AppearancePrefs },
  { id: "catalog", label: "Catalog defaults", icon: faTags, Panel: CatalogDefaults },
  { id: "messaging", label: "Messaging", icon: faComment, Panel: MessagingDefaults },
  { id: "data", label: "Data and account", icon: faDatabase, Panel: DataAccount }
];

export default function Settings() {
  const { hash } = useLocation();
  const active = (SECTIONS.find((s) => `#${s.id}` === hash) ?? SECTIONS[0]).id;
  const [seen, setSeen] = useState(() => new Set([active]));
  const nav = useRef(null);

  useEffect(() => {
    setSeen((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
    nav.current?.querySelector("[aria-current]")?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [active]);

  return (
    <div className={ui.page}>
      <h1 className={styles.title}>Settings</h1>
      <div className={styles.layout}>
        <nav ref={nav} className={styles.nav} aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon }) => (
            <Link key={id} to={{ hash: `#${id}` }} replace aria-current={id === active ? "page" : undefined}>
              <FontAwesomeIcon icon={icon} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.panels}>
          {SECTIONS.filter((s) => s.id === active || seen.has(s.id)).map(({ id, Panel }) => (
            <div key={id} hidden={id !== active}>
              <Panel />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
