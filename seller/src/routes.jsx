import { createBrowserRouter } from "react-router-dom";
import { BASE_PATH } from "./config.js";
import { Boot, PublicOnly, RequireSeller } from "./guards.jsx";
import Shell from "./shell/Shell.jsx";
import Login from "./pages/Login.jsx";
import SignInHelp from "./pages/SignInHelp.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import FirstLogin from "./pages/FirstLogin.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Notifications from "./pages/Notifications.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import Listings from "./listings/Listings.jsx";
import Settings from "./settings/Settings.jsx";
import Help from "./help/Help.jsx";
import Onboarding from "./onboarding/Onboarding.jsx";
import { Navigate } from "react-router-dom";

const page = (title, text) => <Placeholder title={title} text={text} />;

export const routes = [
  {
    element: <Boot><PublicOnly /></Boot>,
    children: [
      { path: "login", element: <Login /> },
      { path: "forgot-password", element: <ForgotPassword /> }
    ]
  },
  { path: "sign-in-help", element: <SignInHelp /> },
  {
    element: <Boot><RequireSeller firstLogin /></Boot>,
    children: [{ path: "first-login", element: <FirstLogin /> }]
  },
  {
    element: <Boot><RequireSeller /></Boot>,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "catalog", element: <Listings /> },
          { path: "offers", element: page("Offers", "Offers and flash sales will be managed here in an upcoming release.") },
          { path: "account", element: page("Account", "Your business profile will be managed here in an upcoming release.") },
          { path: "subscription", element: page("Subscription", "Renewals and payments will be managed here in an upcoming release.") },
          { path: "notifications", element: <Notifications /> },
          { path: "help", element: <Help /> },
          { path: "settings", element: <Settings /> },
          { path: "onboarding", element: <Onboarding /> }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
];

export const createAppRouter = (basename = BASE_PATH) => createBrowserRouter(routes, { basename: basename || undefined });
