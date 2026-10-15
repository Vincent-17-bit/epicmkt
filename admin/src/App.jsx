import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AuthGate from "./auth/AuthGate.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import RoleGuard from "./routes/RoleGuard.jsx";
import { ROUTES } from "./routes/config.js";

// Every admin page is its own chunk. config.js holds the metadata; this map holds the code.
const PAGES = {
  command: lazy(() => import("./pages/CommandCenterPage.jsx")),
  applications: lazy(() => import("./pages/ApplicationsPage.jsx")),
  changes: lazy(() => import("./pages/ChangesPage.jsx")),
  businesses: lazy(() => import("./pages/BusinessesPage.jsx")),
  moderation: lazy(() => import("./pages/ModerationPage.jsx")),
  payments: lazy(() => import("./pages/PaymentsPage.jsx")),
  messages: lazy(() => import("./pages/MessagesPage.jsx")),
  audit: lazy(() => import("./pages/AuditPage.jsx")),
  settings: lazy(() => import("./pages/SettingsPage.jsx")),
  security: lazy(() => import("./pages/SecurityPage.jsx")),
};

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AuthGate><AdminLayout /></AuthGate>}>
        {ROUTES.map((route) => {
          const Page = PAGES[route.id];
          const element = <RoleGuard permission={route.permission}><Page /></RoleGuard>;
          return route.path === ""
            ? <Route key={route.id} index element={element} />
            : <Route key={route.id} path={route.path} element={element} />;
        })}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
