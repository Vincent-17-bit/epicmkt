import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = {
  getSettings: vi.fn(async () => ({ graceDays: 1, strikeThreshold: 3, smsSender: "EpicMKT", quietStart: "21:00", quietEnd: "07:00" })),
  saveSettings: vi.fn(async (values) => values),
};
vi.mock("../api/index.js", () => ({ api, default: api }));
vi.mock("../components/Toast.jsx", () => ({ useToast: () => ({ push: vi.fn() }) }));

const { default: SettingsPage } = await import("./SettingsPage.jsx");

const wrap = (node) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>,
);
afterEach(cleanup);

describe("Settings page", () => {
  it("loads the saved values and saves only when something changed", async () => {
    wrap(<SettingsPage />);
    const grace = await screen.findByLabelText("Grace period (days)");
    expect(grace).toHaveValue(1);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.change(grace, { target: { value: "4" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({
      graceDays: 4, strikeThreshold: 3, smsSender: "EpicMKT", quietStart: "21:00", quietEnd: "07:00",
    }));
  });

  it("shows why a save was refused", async () => {
    api.saveSettings.mockRejectedValueOnce(Object.assign(new Error("invalid_sms_sender"), { code: "invalid_sms_sender" }));
    wrap(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText("SMS sender"), { target: { value: "no spaces" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("3 to 11 letters or numbers");
  });
});
