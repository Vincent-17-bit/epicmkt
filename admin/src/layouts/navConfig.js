import {
  faBolt, faBullhorn, faChartLine, faClockRotateLeft, faComments, faCreditCard, faFileSignature, faGaugeHigh,
  faGear, faGears, faHourglassHalf, faLayerGroup, faShieldHalved, faSitemap, faStore, faUserCheck,
} from "@fortawesome/free-solid-svg-icons";

// The sidebar, as data. A group's `label` is its section heading; the first group has none.
export const navGroups = [
  {
    items: [
      { label: "Command center", to: "/admin", end: true, icon: faGaugeHigh, hint: "items need your attention" },
    ],
  },
  {
    label: "Sellers",
    items: [
      { label: "Applications", to: "/admin/applications", icon: faFileSignature, permission: "applications.view", hint: "applications waiting for a decision" },
      { label: "Businesses", to: "/admin/businesses", icon: faStore, permission: "businesses.view", hint: "sellers expiring within 7 days or in grace" },
      { label: "Expiry radar", to: "/admin/expiry-radar", icon: faHourglassHalf, permission: "expiry.view" },
      { label: "Approvals", to: "/admin/approvals", icon: faUserCheck, permission: "approvals.view", hint: "seller change requests waiting" },
    ],
  },
  {
    label: "Moderation and payments",
    items: [
      { label: "Moderation", to: "/admin/moderation", icon: faShieldHalved, permission: "moderation.view", hint: "open flags and reports" },
      { label: "Payments", to: "/admin/payments", icon: faCreditCard, permission: "payments.view", hint: "payments to confirm" },
    ],
  },
  {
    label: "Messaging",
    items: [
      { label: "Messages", to: "/admin/messages", icon: faComments, permission: "messages.view", hint: "unread messages from sellers" },
      { label: "Broadcasts", to: "/admin/broadcasts", icon: faBullhorn, permission: "messages.view" },
      { label: "Automation", to: "/admin/automation", icon: faGears, permission: "automation.view" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { label: "Flash sales", to: "/admin/flash-sales", icon: faBolt, permission: "flash.view" },
      { label: "Plans", to: "/admin/plans", icon: faLayerGroup, permission: "plans.view" },
      { label: "Categories", to: "/admin/categories", icon: faSitemap, permission: "plans.view" },
    ],
  },
  {
    label: "Reports and settings",
    items: [
      { label: "Analytics", to: "/admin/analytics", icon: faChartLine, permission: "analytics.view" },
      { label: "Audit log", to: "/admin/audit", icon: faClockRotateLeft, permission: "audit.view" },
      { label: "Settings", to: "/admin/settings", icon: faGear, permission: "settings.view" },
    ],
  },
];

// Shown in the mobile tab bar. Everything else goes under "More".
export const tabPaths = ["/admin", "/admin/applications", "/admin/businesses", "/admin/payments"];
