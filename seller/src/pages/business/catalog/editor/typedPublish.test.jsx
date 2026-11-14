import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRODUCT_TYPES } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { signedInApp } from "../../../../test/utils.jsx";

const water = PRODUCT_TYPES.find((t) => t.id === "drinking-water");
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [PRODUCT_TYPES.find((t) => t.id === "drinking-water")], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));

const realMatchMedia = window.matchMedia;
const viewport = (px) => {
  window.matchMedia = (q) => {
    const m = /\((min|max)-width:\s*([\d.]+)rem\)/.exec(q);
    const edge = m ? Number(m[2]) * 16 : 0;
    const matches = m ? (m[1] === "min" ? px >= edge : px <= edge) : false;
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
};
beforeEach(() => viewport(1400));
afterEach(() => { window.matchMedia = realMatchMedia; });

describe("a typed item, from the editor to the shop", () => {
  it("is held back until its required row is filled, then publishes and shows in the catalog", async () => {
    const user = userEvent.setup();
    await signedInApp({ pathname: "/business/catalog/new", state: { productTypeId: water.id } });
    await screen.findByRole("heading", { level: 1, name: "Add item" });

    await user.type(screen.getByLabelText(/^Name/), "Tilisi Spring Water 5L");
    await user.type(screen.getByLabelText("Price (KES)"), "250");

    const publish = await screen.findByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    expect(screen.getByTestId("publish-state")).toHaveTextContent("1 thing needs fixing");

    await user.selectOptions(screen.getByLabelText(/Water type/), "Spring");
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await screen.findByText("Item added and visible to customers.");
    const saved = (await api.getCatalog()).items.find((i) => i.name === "Tilisi Spring Water 5L");
    expect(saved.visible).toBe(true);
    expect(saved.specs).toEqual([expect.objectContaining({ label: "Water type", value: "Spring" })]);
  });
});

describe("one way to add options", () => {
  it("hides the old flat options list once colour or storage options are in use", async () => {
    const user = userEvent.setup();
    await signedInApp({ pathname: "/business/catalog/new", state: { productTypeId: water.id } });
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(screen.getByRole("button", { name: "Add an option" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Use the usual options/ }));
    expect(screen.queryByRole("button", { name: "Add an option" })).toBeNull();
  });
});
