import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastHost } from "../components/ui.jsx";
import { resetPromoMock } from "../api/promo/index.js";
import { mockState } from "../api/promo/mock.js";

export const renderPage = (ui, overrides = {}, seed) => {
  resetPromoMock(overrides);
  seed?.(mockState());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {ui}
        <ToastHost />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

export const iso = (mins) => new Date(Date.now() + mins * 60000).toISOString();
