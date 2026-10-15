import { Link } from "react-router-dom";
import { Card } from "../../components/index.js";
import Icon from "../../components/Icon.jsx";
import s from "./command.module.css";

const ACTIONS = [
  { id: "applications", label: "Review applications", icon: "file", to: "/admin/applications?status=submitted", permission: "applications.view" },
  { id: "payments", label: "Confirm payments", icon: "money", to: "/admin/payments?status=submitted", permission: "payments.view" },
  { id: "message", label: "Message sellers", icon: "mail", to: "/admin/messages", permission: "messages.send" },
  { id: "businesses", label: "Browse businesses", icon: "store", to: "/admin/businesses", permission: "businesses.view" },
  { id: "moderation", label: "Flags and reports", icon: "flag", to: "/admin/moderation", permission: "moderation.view" },
  { id: "audit", label: "Audit log", icon: "history", to: "/admin/audit", permission: "audit.view" },
];

/** Shortcuts to the pages this role can open. Roles never see a shortcut that would only lead to "no access". */
export default function QuickActions({ can }) {
  const actions = ACTIONS.filter((a) => can(a.permission));
  if (actions.length === 0) return null;
  return (
    <Card as="section" title="Quick actions" headingLevel={2} className={s.span5}>
      <div className={s.quick}>
        {actions.map((a) => (
          <Link key={a.id} to={a.to} className={s.quickLink}><Icon name={a.icon} />{a.label}</Link>
        ))}
      </div>
    </Card>
  );
}
