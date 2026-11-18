import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptyItemForm } from "@epicmkt/shared";
import LivePreview from "./LivePreview.jsx";

// The Page view frames the buyer site's /preview/item. When that page refuses this seller address (or never answers), the editor
// switches to its own page view instead of leaving a blank frame.
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LivePreview form={{ ...emptyItemForm(), name: "White bread", price: "60" }} images={[]} media={[]} area={null} shop={{ slug: "sunrise" }} />
    </QueryClientProvider>
  );

const showPage = () => fireEvent.click(screen.getByRole("button", { name: "Page" }));

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

describe("live preview of the real item page", () => {
  it("frames the buyer site's preview page for the shop", () => {
    vi.stubEnv("VITE_CLIENT_URL", "https://client.test/");
    mount();
    showPage();
    expect(screen.getByTitle("Your item on EpicMKT")).toHaveAttribute("src", "https://client.test/preview/item?shop=sunrise");
  });

  it("falls back to its own page view when the buyer site refuses this address", () => {
    vi.stubEnv("VITE_CLIENT_URL", "https://client.test");
    mount();
    showPage();
    const frame = screen.getByTitle("Your item on EpicMKT");
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "epicmkt:preview-refused" }, source: frame.contentWindow })); });
    expect(screen.queryByTitle("Your item on EpicMKT")).not.toBeInTheDocument();
    expect(screen.getByText(/could not open here, so this is a simpler preview/)).toBeInTheDocument();
  });

  it("falls back when the buyer site never answers", () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_CLIENT_URL", "https://client.test");
    mount();
    showPage();
    expect(screen.getByTitle("Your item on EpicMKT")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(12_500); });
    expect(screen.queryByTitle("Your item on EpicMKT")).not.toBeInTheDocument();
  });
});
