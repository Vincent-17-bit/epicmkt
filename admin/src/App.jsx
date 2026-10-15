import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isMockApi } from "./api/index.js";
import AdminLayout from "./layouts/AdminLayout.jsx";
import CommandCenterPage from "./pages/CommandCenterPage.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";
import BusinessesPage from "./pages/BusinessesPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

// The component kit is for developers: available in dev builds and in mock mode, never against live data.
const KitPage = lazy(() => import("./pages/KitPage.jsx"));
const showKit = import.meta.env.DEV || isMockApi;

export default function App() {
  return (
    <Routes>
      {showKit ? (
        <Route
          path="/admin/_kit"
          element={
            <Suspense fallback={null}>
              <KitPage />
            </Suspense>
          }
        />
      ) : null}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<CommandCenterPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
