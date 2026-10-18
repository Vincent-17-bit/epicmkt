import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShortLink from "./ShortLink.jsx";

vi.mock("../api/index.js", () => ({
  resolveShortcode: vi.fn(async (code) => {
    if (code === "nope") throw Object.assign(new Error("nf"), { name: "NotFoundError" });
    return { slug: "fade-kings" };
  })
}));
vi.mock("./NotFound.jsx", () => ({ default: () => <p>not found</p> }));

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="loc">{`${pathname}${search}`}</p>;
}

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Where />
        <Routes>
          <Route path="/s/:shortcode" element={<ShortLink />} />
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

describe("ShortLink", () => {
  it("opens the business page", async () => {
    mount("/s/abc123");
    await vi.waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/b/fade-kings"));
  });

  it("opens an item page when the link carries an item", async () => {
    mount("/s/abc123?item=skin%20fade");
    await vi.waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/b/fade-kings/item/skin%20fade"));
  });

  it("shows not found for an unknown code", async () => {
    mount("/s/nope");
    expect(await screen.findByText("not found")).toBeInTheDocument();
  });
});
