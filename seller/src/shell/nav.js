import { faBoxesStacked, faCircleQuestion, faCreditCard, faGear, faHouse, faTags, faUser, faBell } from "@fortawesome/free-solid-svg-icons";

export const NAV = [
  { key: "home", to: "/", label: "Home", icon: faHouse, end: true },
  { key: "catalog", to: "/catalog", label: "Catalog", icon: faBoxesStacked },
  { key: "offers", to: "/offers", label: "Offers", icon: faTags },
  { key: "account", to: "/account", label: "Account", icon: faUser },
  { key: "subscription", to: "/subscription", label: "Subscription", icon: faCreditCard },
  { key: "notifications", to: "/notifications", label: "Notifications", icon: faBell },
  { key: "help", to: "/help", label: "Help", icon: faCircleQuestion }
];

export const BOTTOM = ["home", "catalog", "account", "offers"];
export const MORE = [
  { key: "subscription", to: "/subscription", label: "Subscription", icon: faCreditCard },
  { key: "notifications", to: "/notifications", label: "Notifications", icon: faBell },
  { key: "help", to: "/help", label: "Help", icon: faCircleQuestion },
  { key: "settings", to: "/settings", label: "Settings", icon: faGear }
];
export const byKey = (key) => NAV.find((n) => n.key === key);
