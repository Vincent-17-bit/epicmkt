import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App.jsx";
import * as api from "../api/index.js";
import * as mock from "../api/mock.js";
import { setNow } from "../lib/clock.js";

export const M = mock.__mock;

export const setTime = (iso) => {
  M.setClock(iso);
  setNow(iso);
};

export async function signedInApp(path = "/business/subscription", prepare) {
  mock.resetMock();
  setTime(null);
  await api.login("ES100001", "Demo-Passw0rd");
  await prepare?.();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  const router = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, client, router };
}

export const nairobiMidnight = (day) => new Date(`${day}T00:00:00+03:00`).toISOString();
export const file = (name, type, bytes) => new File([bytes], name, { type });
export const bytesOf = (text) => new TextEncoder().encode(text);
export const PDF_OK = bytesOf("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
