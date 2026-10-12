import "@fontsource-variable/inter";
import "@epicmkt/shared/tokens.css";
import "@epicmkt/shared/reset.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./App.jsx";
import { readOverrides, resetPromoMock } from "./api/promo/index.js";

if (import.meta.env.DEV && import.meta.env.VITE_API_MODE !== "live") resetPromoMock(readOverrides(window.location.search));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
