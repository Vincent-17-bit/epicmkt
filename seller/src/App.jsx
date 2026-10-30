import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireSeller from "./components/RequireSeller.jsx";
import Login from "./pages/Login.jsx";
import Subscription from "./pages/business/Subscription.jsx";
import Receipt from "./pages/business/Receipt.jsx";
import Notifications from "./pages/business/Notifications.jsx";
import Questions from "./pages/business/Questions.jsx";
import Exceptions from "./pages/business/Exceptions.jsx";
import Flash from "./pages/business/Flash.jsx";
import Offers from "./pages/business/Offers.jsx";
import Account from "./pages/business/Account.jsx";
import Catalog from "./pages/business/catalog/Catalog.jsx";
import ItemEditor from "./pages/business/catalog/ItemEditor.jsx";
import Preview from "./pages/business/Preview.jsx";
import QrPoster from "./pages/business/QrPoster.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireSeller />}>
        <Route path="/business" element={<Layout />}>
          <Route index element={<Navigate to="subscription" replace />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="subscription/receipts/:id" element={<Receipt />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="questions" element={<Questions />} />
          <Route path="exceptions" element={<Exceptions />} />
          <Route path="account" element={<Account />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="catalog/new" element={<ItemEditor />} />
          <Route path="catalog/:itemId/edit" element={<ItemEditor />} />
          <Route path="flash" element={<Flash />} />
          <Route path="offers" element={<Offers />} />
          <Route path="preview" element={<Preview />} />
          <Route path="qr" element={<QrPoster />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/business/subscription" replace />} />
    </Routes>
  );
}
