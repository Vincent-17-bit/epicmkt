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
import ItemEditor from "./pages/business/catalog/editor/ItemEditor.jsx";
import Preview from "./pages/business/Preview.jsx";
import Gallery from "./pages/business/Gallery.jsx";
import Team from "./pages/business/Team.jsx";
import QrPoster from "./pages/business/QrPoster.jsx";
import Settings from "./settings/Settings.jsx";
import Help from "./help/Help.jsx";
import Onboarding from "./onboarding/Onboarding.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireSeller />}>
        {/* The item editor is a page of its own, without the app's bottom navigation, so it can have its own bars. */}
        <Route path="/business/catalog/new" element={<ItemEditor />} />
        <Route path="/business/catalog/:itemId/edit" element={<ItemEditor />} />
        <Route path="/business" element={<Layout />}>
          <Route index element={<Navigate to="subscription" replace />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="subscription/receipts/:id" element={<Receipt />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="questions" element={<Questions />} />
          <Route path="exceptions" element={<Exceptions />} />
          <Route path="account" element={<Account />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="flash" element={<Flash />} />
          <Route path="offers" element={<Offers />} />
          <Route path="preview" element={<Preview />} />
          <Route path="qr" element={<QrPoster />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="onboarding" element={<Onboarding />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/business/subscription" replace />} />
    </Routes>
  );
}
