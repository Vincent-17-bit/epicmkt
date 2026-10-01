import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import OfflinePage from "./pages/OfflinePage.jsx";
import NotFound from "./pages/NotFound.jsx";
import RouteError from "./pages/RouteError.jsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: "offline", element: <OfflinePage /> },
          { path: "*", element: <NotFound /> }
        ]
      }
    ]
  }
]);
