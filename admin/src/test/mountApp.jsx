// Renders the real admin app (demo auth, mock API, real theme provider) at a path, in a given theme.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { THEME_STORAGE_KEY } from "../lib/theme.js";
import { ThemeProvider } from "../theme/ThemeProvider.jsx";
import { ToastProvider } from "../components/Toast.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import App from "../App.jsx";

// jsdom has no matchMedia or ResizeObserver; the table and layout use both. Desktop width, no preferences set.
export function stubBrowserApis() {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
}

export function mountApp(path, theme = "light") {
  stubBrowserApis();
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
