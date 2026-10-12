import { Navigate, createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";

const lazy = (load) => async () => ({ Component: (await load()).default });

export const routes = [
  { path: "/login", element: <Login /> },
  {
    path: "/business",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="offers" replace /> },
      { path: "offers", lazy: lazy(() => import("./pages/offers/OffersPage.jsx")) },
      { path: "gallery", lazy: lazy(() => import("./pages/gallery/GalleryPage.jsx")) },
      { path: "team", lazy: lazy(() => import("./pages/team/TeamPage.jsx")) },
      { path: "qr", lazy: lazy(() => import("./pages/qr/QrPage.jsx")) },
    ],
  },
  { path: "*", element: <Navigate to="/business/offers" replace /> },
];

export const router = createBrowserRouter(routes);
