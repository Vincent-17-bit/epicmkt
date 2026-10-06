import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Faq from "./pages/Faq.jsx";
import Sell from "./pages/Sell.jsx";
import SellRegister from "./pages/SellRegister.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import Cookies from "./pages/Cookies.jsx";
import FlashSales from "./pages/FlashSales.jsx";
import Offers from "./pages/Offers.jsx";
import Business from "./pages/Business.jsx";
import ShortLink from "./pages/ShortLink.jsx";
import OfflinePage from "./pages/OfflinePage.jsx";
import NotFound from "./pages/NotFound.jsx";
import RouteError from "./pages/RouteError.jsx";
import { trackResults } from "./lib/resultsMemory.js";

export const router = createBrowserRouter([
  {
    path: "/become-a-seller",
    lazy: async () => ({ Component: (await import("./pages/seller-apply/PublicSellerLayout.jsx")).default }),
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/seller-apply/BecomeASeller.jsx")).default }) },
      { path: "status", lazy: async () => ({ Component: (await import("./pages/seller-apply/status/CheckStatus.jsx")).default }) }
    ]
  },
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: "c/:slug", element: <Home /> },
          { path: "search", element: <Home /> },
          { path: "flash", element: <FlashSales /> },
          { path: "offers", element: <Offers /> },
          { path: "b/:slug", element: <Business /> },
          { path: "s/:shortcode", element: <ShortLink /> },
          { path: "about", element: <About /> },
          { path: "contact", element: <Contact /> },
          { path: "faq", element: <Faq /> },
          { path: "sell", element: <Sell /> },
          { path: "sell/register", element: <SellRegister /> },
          { path: "privacy", element: <Privacy /> },
          { path: "terms", element: <Terms /> },
          { path: "cookies", element: <Cookies /> },
          { path: "offline", element: <OfflinePage /> },
          ...(import.meta.env.DEV
            ? [{ path: "styleguide", lazy: async () => ({ Component: (await import("./pages/Styleguide.jsx")).default }) }]
            : []),
          { path: "*", element: <NotFound /> }
        ]
      }
    ]
  }
]);

router.subscribe((state) => trackResults(state.location));
