import { createBrowserRouter, Navigate } from "react-router-dom";
import { BASE_PATH } from "./config.js";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import FirstLogin from "./pages/FirstLogin.jsx";

export const routes = [
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "login", element: <Login /> },
  { path: "forgot-password", element: <ForgotPassword /> },
  { path: "first-login", element: <FirstLogin /> },
  { path: "*", element: <Navigate to="/login" replace /> }
];

export const createAppRouter = (basename = BASE_PATH) => createBrowserRouter(routes, { basename: basename || undefined });
