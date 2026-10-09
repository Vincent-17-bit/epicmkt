import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@epicmkt/ui/reset.css";
import "@epicmkt/ui/tokens.css";
import "./styles/theme.css";
import { ThemeProvider } from "./state/theme.jsx";
import { createAppRouter } from "./routes.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={createAppRouter()} />
    </ThemeProvider>
  </StrictMode>
);
