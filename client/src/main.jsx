import "@fontsource-variable/inter";
import "@epicmkt/shared/tokens.css";
import "@epicmkt/shared/reset.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./lib/queryClient.js";
import { router } from "./router.jsx";
import CountdownProvider from "./components/CountdownProvider.jsx";
import { useUiStore } from "./stores/ui.js";
import { watchSystem } from "./lib/theme.js";

watchSystem(() => useUiStore.getState().theme);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CountdownProvider>
        <RouterProvider router={router} />
      </CountdownProvider>
    </QueryClientProvider>
  </StrictMode>
);
