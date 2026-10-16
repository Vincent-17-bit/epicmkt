import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout.jsx";
import CommandCenterPage from "./pages/CommandCenterPage.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";
import BusinessesPage from "./pages/BusinessesPage.jsx";
import BusinessDetailPage from "./pages/BusinessDetailPage.jsx";
import ViewAsSellerPage from "./pages/ViewAsSellerPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<CommandCenterPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route path="businesses/:id" element={<BusinessDetailPage />} />
        <Route path="businesses/:id/view-as-seller" element={<ViewAsSellerPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
