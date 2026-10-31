import AccountSecurity from "./AccountSecurity.jsx";
import NotificationPrefs from "./NotificationPrefs.jsx";
import AppearancePrefs from "./AppearancePrefs.jsx";
import CatalogDefaults from "./CatalogDefaults.jsx";
import MessagingDefaults from "./MessagingDefaults.jsx";
import BusinessPrefs from "./BusinessPrefs.jsx";
import DataAccount from "./DataAccount.jsx";
import styles from "./settings.module.css";

const SECTIONS = [
  ["account", "Account and security"],
  ["notifications", "Notifications"],
  ["appearance", "Appearance"],
  ["catalog", "Catalog defaults"],
  ["messaging", "Messaging"],
  ["business", "Business"],
  ["data", "Data and account"]
];

export default function Settings() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Settings</h1>
        <p>Changes save as soon as you make them.</p>
      </header>
      <div className={styles.layout}>
        <nav className={styles.jump} aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <div className={styles.sections}>
          <AccountSecurity />
          <NotificationPrefs />
          <AppearancePrefs />
          <CatalogDefaults />
          <MessagingDefaults />
          <BusinessPrefs />
          <DataAccount />
        </div>
      </div>
    </div>
  );
}
