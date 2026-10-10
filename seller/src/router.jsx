import { createBrowserRouter, Navigate } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Login from "./pages/Login.jsx";
import Account from "./pages/Account.jsx";
import Plan from "./pages/Plan.jsx";
import NotFound from "./pages/NotFound.jsx";

export const routes = [
  { path: "/login", element: <Login /> },
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Navigate to="/business/account" replace /> },
      { path: "/business/account", element: <Account /> },
      { path: "/business/plan", element: <Plan /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

export const router = createBrowserRouter(routes);
