import { createBrowserRouter, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout.jsx";
import HoursPage from "./pages/hours/HoursPage.jsx";
import NotFound from "./pages/NotFound.jsx";

export const routes = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/business/hours" replace /> },
      { path: "business/hours", element: <HoursPage /> },
      { path: "*", element: <NotFound /> }
    ]
  }
];

export const router = createBrowserRouter(routes);
