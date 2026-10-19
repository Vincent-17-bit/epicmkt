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

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<CommandCenterPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
          <Route path="businesses" element={<BusinessesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="flash-sales" element={<FlashSalesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="table-test" element={<DataTableTestPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
