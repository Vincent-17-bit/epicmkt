import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { M, signedInApp } from "../../../../test/utils.jsx";
import * as api from "../../../../api/index.js";
import { useSettings } from "../../../../state/settings.js";

beforeEach(() => useSettings.getState().reset());

const openNew = async (catalog) => {
  const app = await signedInApp("/business/catalog/new", async () => {
    if (catalog) await api.saveSettings({ catalog });
  });
  await screen.findByRole("heading", { level: 1, name: "Add item" });
  return app;
};

describe("a new item starts from the seller's saved catalog defaults", () => {
  it("uses the built-in starting values when nothing is saved", async () => {
    await openNew();
    expect(await screen.findByLabelText("Availability")).toHaveValue("available");
  });

  it("picks up a saved default availability", async () => {
    await openNew({ default_availability: "out_of_stock" });
    expect(await screen.findByLabelText("Availability")).toHaveValue("out_of_stock");
  });

  it("an item that already exists is never changed by the defaults", async () => {
    const id = M.state.items[0].id;
    const before = M.state.items[0].availability;
    await signedInApp(`/business/catalog/${id}/edit`, async () => { await api.saveSettings({ catalog: { default_availability: "out_of_stock" } }); });
    await screen.findByRole("heading", { level: 1 });
    expect(await screen.findByLabelText("Availability")).toHaveValue(before);
  });
});
