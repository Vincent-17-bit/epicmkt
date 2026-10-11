import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { SessionGate } from "./shell/Session.jsx";
import { BusinessLayout, NotFound } from "./shell/BusinessLayout.jsx";
import { PlanPage } from "./plan/PlanPage.jsx";
import { CatalogPage } from "./catalog/CatalogPage.jsx";

export const routes = [
  { path: "/", element: <Navigate to="/business/catalog" replace /> },
  {
    path: "/business",
    element: <BusinessLayout />,
    children: [
      { index: true, element: <Navigate to="catalog" replace /> },
      { path: "catalog", element: <CatalogPage /> },
      { path: "plan", element: <PlanPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

const router = createBrowserRouter(routes);

export function App() {
  return (
    <SessionGate>
      <RouterProvider router={router} />
    </SessionGate>
  );
}
