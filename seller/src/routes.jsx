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
          { path: "catalog", element: page("Catalog", "Your items will be managed here in an upcoming release.") },
          { path: "offers", element: page("Offers", "Offers and flash sales will be managed here in an upcoming release.") },
          { path: "account", element: page("Account", "Your business profile will be managed here in an upcoming release.") },
          { path: "subscription", element: page("Subscription", "Renewals and payments will be managed here in an upcoming release.") },
          { path: "notifications", element: <Notifications /> },
          { path: "help", element: page("Help", "Need a hand? Contact the EpicMKT team and we will get back to you.") },
          { path: "settings", element: page("Settings", "Session and security settings will be managed here in an upcoming release.") },
          { path: "onboarding", element: page("Welcome", "Your setup guide will appear here in an upcoming release.") }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
];

export const createAppRouter = (basename = BASE_PATH) => createBrowserRouter(routes, { basename: basename || undefined });
