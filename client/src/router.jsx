import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Faq from "./pages/Faq.jsx";
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
          { path: "c/:slug", element: <Home /> },
          { path: "about", element: <About /> },
          { path: "contact", element: <Contact /> },
          { path: "faq", element: <Faq /> },
          { path: "offline", element: <OfflinePage /> },
          { path: "*", element: <NotFound /> }
        ]
      }
    ]
  }
]);
