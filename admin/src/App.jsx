import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout.jsx";
import CommandCenterPage from "./pages/CommandCenterPage.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";
import ApplicationDetailPage from "./pages/applications/ApplicationDetailPage.jsx";
import BusinessesPage from "./pages/BusinessesPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import FlashSalesPage from "./pages/FlashSalesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import DataTableTestPage from "./pages/DataTableTestPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import RequireAdmin from "./auth/RequireAdmin.jsx";
import RoleGuard from "./routes/RoleGuard.jsx";
import BusinessDetailPage from "./pages/business/BusinessDetailPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<CommandCenterPage />} />
          <Route path="applications" element={<RoleGuard permission="applications.view"><ApplicationsPage /></RoleGuard>} />
          <Route path="applications/:id" element={<RoleGuard permission="applications.view"><ApplicationDetailPage /></RoleGuard>} />
          <Route path="businesses" element={<RoleGuard permission="businesses.view"><BusinessesPage /></RoleGuard>} />
          <Route path="businesses/:id" element={<RoleGuard permission="businesses.view"><BusinessDetailPage /></RoleGuard>} />
          <Route path="payments" element={<RoleGuard permission="payments.view"><PaymentsPage /></RoleGuard>} />
          <Route path="messages" element={<RoleGuard permission="messages.view"><MessagesPage /></RoleGuard>} />
          <Route path="flash-sales" element={<RoleGuard permission="flash.view"><FlashSalesPage /></RoleGuard>} />
          <Route path="settings" element={<RoleGuard permission="settings.view"><SettingsPage /></RoleGuard>} />
          <Route path="account" element={<AccountPage />} />
          <Route path="table-test" element={<DataTableTestPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
