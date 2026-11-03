import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/index.js", () => ({ saveSettings: vi.fn() }));

import * as api from "../api/index.js";
import { useSettings } from "./settings.js";
import { getThemeMode, getTheme, isThemePending, setTheme, setThemePending } from "../lib/theme.js";

const serverCopy = (theme) => ({ appearance: { theme } });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  useSettings.getState().reset();
  api.saveSettings.mockReset();
  api.saveSettings.mockResolvedValue({});
});

describe("seller theme survives a refresh", () => {
  it("keeps a choice the server has not stored yet, and sends it again", async () => {
    // Dark was picked on this device, but the page was refreshed before the save reached the server.
    setTheme("dark");
    setThemePending(true);
    useSettings.getState().load(serverCopy("light"), "seller-1");
    expect(getThemeMode()).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(useSettings.getState().settings.appearance.theme).toBe("dark");
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ appearance: { theme: "dark" } }));
  });

  it("takes the server's theme when nothing is waiting to be saved (another device changed it)", () => {
    setTheme("light");
    useSettings.getState().load(serverCopy("dark"), "seller-1");
    expect(getTheme()).toBe("dark");
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("stops marking the choice as waiting once the server has it", async () => {
    useSettings.getState().load(serverCopy("light"), "seller-1");
    await useSettings.getState().update({ appearance: { theme: "dark" } }, { quiet: true });
    expect(getTheme()).toBe("dark");
    expect(isThemePending()).toBe(false);
  });

  it("keeps the chosen theme on screen when the save fails, and retries on the next load", async () => {
    useSettings.getState().load(serverCopy("light"), "seller-1");
    api.saveSettings.mockRejectedValue(new Error("offline"));
    const result = await useSettings.getState().update({ appearance: { theme: "dark" } }, { quiet: true });
    expect(result.ok).toBe(false);
    expect(getTheme()).toBe("dark");
    expect(getThemeMode()).toBe("dark");
    expect(useSettings.getState().settings.appearance.theme).toBe("dark");
    expect(isThemePending()).toBe(true);

    api.saveSettings.mockReset();
    api.saveSettings.mockResolvedValue({});
    useSettings.getState().load(serverCopy("light"), "seller-1");
    expect(getTheme()).toBe("dark");
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ appearance: { theme: "dark" } }));
  });

  it("still undoes a failed change to other appearance settings", async () => {
    useSettings.getState().load({ appearance: { theme: "light", text_size: "normal" } }, "seller-1");
    api.saveSettings.mockRejectedValue(new Error("offline"));
    await useSettings.getState().update({ appearance: { text_size: "large" } }, { quiet: true });
    expect(useSettings.getState().settings.appearance.text_size).toBe("normal");
    expect(document.documentElement.dataset.textSize).toBe("normal");
  });
});
