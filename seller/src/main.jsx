import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@epicmkt/ui/reset.css";
import "@epicmkt/ui/tokens.css";
import "./styles/seller.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true } } });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
