import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
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
          { path: "flash", lazy: async () => ({ Component: (await import("./pages/FlashSales.jsx")).default }) },
          { path: "offers", lazy: async () => ({ Component: (await import("./pages/Offers.jsx")).default }) },
          { path: "featured", lazy: async () => ({ Component: (await import("./pages/Featured.jsx")).default }) },
          { path: "b/:slug", lazy: async () => ({ Component: (await import("./pages/Business.jsx")).default }) },
          { path: "b/:slug/i/:itemId", lazy: async () => ({ Component: (await import("./pages/ItemPage.jsx")).default }) },
          { path: "s/:shortcode", lazy: async () => ({ Component: (await import("./pages/ShortLink.jsx")).default }) },
          { path: "about", lazy: async () => ({ Component: (await import("./pages/About.jsx")).default }) },
          { path: "contact", lazy: async () => ({ Component: (await import("./pages/Contact.jsx")).default }) },
          { path: "faq", lazy: async () => ({ Component: (await import("./pages/Faq.jsx")).default }) },
          { path: "sell", lazy: async () => ({ Component: (await import("./pages/Sell.jsx")).default }) },
          { path: "pricing", lazy: async () => ({ Component: (await import("./pages/Pricing.jsx")).default }) },
          { path: "seller-guide", lazy: async () => ({ Component: (await import("./pages/SellerGuide.jsx")).default }) },
          { path: "sell/register", lazy: async () => ({ Component: (await import("./pages/SellRegister.jsx")).default }) },
          { path: "privacy", lazy: async () => ({ Component: (await import("./pages/Privacy.jsx")).default }) },
          { path: "terms", lazy: async () => ({ Component: (await import("./pages/Terms.jsx")).default }) },
          { path: "cookies", lazy: async () => ({ Component: (await import("./pages/Cookies.jsx")).default }) },
          { path: "offline", lazy: async () => ({ Component: (await import("./pages/OfflinePage.jsx")).default }) },
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
