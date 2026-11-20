import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = {
  getZoomSettings: vi.fn(async () => ({ enabled: true, scale: 2, lens: "sky" })),
  saveZoomSettings: vi.fn(async (values) => values),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
vi.mock("../../components/Toast.jsx", () => ({ useToast: () => ({ push: vi.fn() }) }));

const { default: ZoomSettings } = await import("./ZoomSettings.jsx");

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ZoomSettings />
  </QueryClientProvider>,
);
afterEach(cleanup);

describe("Photo zoom settings", () => {
  it("saves only after a change, with the chosen strength and colour", async () => {
    wrap();
    const save = await screen.findByRole("button", { name: "Save zoom" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "3×" }));
    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.saveZoomSettings).toHaveBeenCalledWith({ enabled: true, scale: 3, lens: "teal" }));
  });

  it("offers no free colour picking", async () => {
    wrap();
    await screen.findByRole("button", { name: "Save zoom" });
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
  });

  it("switching zoom off disables the other choices", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Zoom on" }));
    expect(screen.getByRole("radio", { name: "3×" })).toBeDisabled();
  });
});
