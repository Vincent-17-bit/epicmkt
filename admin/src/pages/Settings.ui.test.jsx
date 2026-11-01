import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const HEALTH = {
  weights: { profile: 20, freshness: 25, activity: 35, trust: 20 }, grace_days: 14, neutral: 70, freshness_days: 14,
  freshness_days_by_category: { bakery: 3 }, activity_full_days: 3, activity_zero_days: 30,
  trust: { flag: 25, flag_cap: 50, report: 15, report_cap: 30, strike: 20, strike_cap: 60 },
  serious_flag_days: 7, bands: { healthy: 70, watch: 40 },
};
const api = {
  getHealthConfig: vi.fn(async () => structuredClone(HEALTH)),
  saveHealthConfig: vi.fn(async (config) => config),
  listCategories: vi.fn(async () => [{ id: "bakery", name: "Bakery" }, { id: "tailor", name: "Tailor" }]),
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

  it("the system form and the health form each have their own save button", async () => {
    wrap(<SettingsPage />);
    await screen.findByLabelText("Grace period (days)");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Save health settings" })).toBeDisabled();
  });

  it("shows each weight as a live share of the score and saves the whole configuration", async () => {
    wrap(<SettingsPage />);
    const profile = await screen.findByLabelText("Profile weight");
    expect(profile).toHaveValue(20);
    expect(screen.getByRole("img", { name: /Share of the score: Profile 20%, Prices 25%, Activity 35%, Trust 20%/ })).toBeInTheDocument();
    fireEvent.change(profile, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Trust weight"), { target: { value: "0" } });
    expect(screen.getByRole("img", { name: /Profile 0%, Prices 42%, Activity 58%, Trust 0%/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save health settings" }));
    await waitFor(() => expect(api.saveHealthConfig).toHaveBeenCalledWith({ ...HEALTH, weights: { profile: 0, freshness: 25, activity: 35, trust: 0 } }));
  });

  it("explains a bad number next to the field and does not call the server", async () => {
    api.saveHealthConfig.mockClear();
    wrap(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText("Watch from"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save health settings" }));
    expect(await screen.findByText(/“Watch from” must be lower than “Healthy from”/)).toBeInTheDocument();
    expect(screen.getByLabelText("Watch from")).toHaveAttribute("aria-invalid", "true");
    expect(api.saveHealthConfig).not.toHaveBeenCalled();
  });

  it("adds and removes a category window", async () => {
    api.saveHealthConfig.mockClear();
    wrap(<SettingsPage />);
    await screen.findByLabelText("Profile weight");
    fireEvent.click(screen.getByRole("button", { name: "Add a category" }));
    fireEvent.click(screen.getByRole("button", { name: "Save health settings" }));
    await waitFor(() => expect(api.saveHealthConfig).toHaveBeenCalledWith({ ...HEALTH, freshness_days_by_category: { bakery: 3, tailor: 14 } }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bakery" }));
    fireEvent.click(screen.getByRole("button", { name: "Save health settings" }));
    await waitFor(() => expect(api.saveHealthConfig).toHaveBeenLastCalledWith({ ...HEALTH, freshness_days_by_category: { tailor: 14 } }));
  });
});
