import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PreviewItem from "./PreviewItem.jsx";

// The seller editor frames /preview/item and posts the form to it. Only the seller site may fill it; anyone else gets told no, so the
// editor can fall back to its own preview instead of a page that never fills.
const mocks = vi.hoisted(() => ({ getBusiness: vi.fn(), getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ getBusiness: mocks.getBusiness, logContactEvent: vi.fn(), logEvent: vi.fn(), items: { getDetail: mocks.getDetail, getStoreSelective: mocks.getStoreSelective } }));

const payload = {
  row: { id: "preview", name: "White bread", price: 60, price_type: "from", availability: "available", highlights: [], includes: [], specs: [] },
  business: { id: "b1", slug: "sunrise", name: "Sunrise Bakery" },
  options: null,
  media: [{ id: "m1", kind: "image", url: "https://img.test/a.jpg" }],
  media3d: []
};

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/preview/item?shop=sunrise"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PreviewItem />
      </QueryClientProvider>
    </MemoryRouter>
  );

const post = (origin) => act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "epicmkt:item-preview", payload }, origin, source: window })); });

afterEach(() => vi.restoreAllMocks());

describe("the item preview page", () => {
  it("refuses a form from an address that is not the seller site, and says so", async () => {
    mocks.getBusiness.mockRejectedValue(new Error("not public"));
    const reply = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    mount();
    post("https://someone-else.example");
    expect(reply).toHaveBeenCalledWith({ type: "epicmkt:preview-refused" }, "https://someone-else.example");
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your item");
  });

  it("shows the item sent by the seller site on Vercel without any setting", async () => {
    mocks.getBusiness.mockRejectedValue(new Error("not public"));
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
    mount();
    post("https://epicmkt-seller.vercel.app");
    expect(await screen.findByRole("heading", { name: "White bread" })).toBeInTheDocument();
  });
});
