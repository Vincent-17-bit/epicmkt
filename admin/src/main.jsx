import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@epicmkt/shared/reset.css";
import "@epicmkt/shared/tokens.css";
import "./styles/admin.css";
import "./styles/login.css";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { applySavedTheme } from "./lib/theme.js";

applySavedTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
