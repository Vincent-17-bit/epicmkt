// A new item must say what it is (migration 0141): the form, the suggestion, "Other", and the old untyped item that stays editable.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../../api/index.js";
import { M, signedInApp } from "../../../test/utils.jsx";

const viewport = (px) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });
  window.matchMedia = (query) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = max ? px <= Number(max[1]) : min ? px >= Number(min[1]) : false;
    return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
};
const realMatchMedia = window.matchMedia;
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; });

const base = { name: "Odd listing", description: "", section: "", priceType: "fixed", price: 100, availability: "available" };

describe("server rule (the mock follows seller_save_item)", () => {
  it("refuses a new item with no type, a null type or a blank one", async () => {
    await signedInApp("/business/subscription");
    for (const fields of [base, { ...base, productTypeId: null }, { ...base, productTypeId: "" }, { ...base, productTypeId: "  " }]) {
      await expect(api.saveItem(null, fields)).rejects.toMatchObject({ code: "product_type_required" });
    }
  });

  it("accepts a new item typed Other, and the type is stored", async () => {
    await signedInApp("/business/subscription");
    const id = await api.saveItem(null, { ...base, productTypeId: "other" });
    expect(M.state.items.find((i) => i.id === id)).toMatchObject({ name: "Odd listing", productTypeId: "other" });
  });

  it("lists Other among the types, so the server and the form agree it is real", async () => {
    await signedInApp("/business/subscription");
    const { types } = await api.sellerProductTypes();
    expect(types.find((t) => t.id === "other")).toMatchObject({ name: "Other", kind: "good" });
  });
});

describe("the form", () => {
  it("a new item with no type goes through the picker, never straight to a typeless editor", async () => {
    viewport(1000);
    await signedInApp("/business/catalog/new");
    expect(await screen.findByRole("heading", { level: 1, name: "What are you adding?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("suggests a type from what is typed, and one tap uses it", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add");
    await user.type(await screen.findByRole("searchbox", { name: "Search for what you sell" }), "Infinix Hot 40 phone");
    const hint = await screen.findByTestId("type-suggestion");
    expect(hint).toHaveTextContent("Phone");
    await user.click(within(hint).getByRole("button", { name: "Use Phone" }));
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(within(document.getElementById("sec-type")).getByText("Phone")).toBeInTheDocument();
  });

  it("says nothing when the words give no clue, and Other is always there", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add");
    await user.type(await screen.findByRole("searchbox", { name: "Search for what you sell" }), "Zzyzx");
    expect(screen.queryByTestId("type-suggestion")).toBeNull();
    expect(screen.getByRole("button", { name: "Add as Other goods" })).toBeInTheDocument();
  });

  it("Other opens the editor, and saving sends productTypeId other", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add");
    await user.click(await screen.findByRole("button", { name: "Add as Other goods" }));
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(within(document.getElementById("sec-type")).getByText("Other goods")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Hand-made basket");
    await user.type(screen.getByLabelText("Price (KES)"), "450");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Hand-made basket", productTypeId: "other" }));
  });

  it("an Other item whose name says what it is gets a one-tap suggestion, never a silent switch", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp({ pathname: "/business/catalog/new", state: { productTypeId: "other" } });
    await user.type(await screen.findByLabelText("Name"), "Samsung phone");
    const hint = await within(document.getElementById("sec-type")).findByTestId("type-suggestion");
    expect(hint).toHaveTextContent("Phone");
    expect(within(document.getElementById("sec-type")).getByText("Other goods")).toBeInTheDocument(); // not switched yet
    await user.click(within(hint).getByRole("button", { name: "Use Phone" }));
    await waitFor(() => expect(within(document.getElementById("sec-type")).getByText("Phone")).toBeInTheDocument());
  });
});

describe("old items", () => {
  it("an item with no type can still be edited and saved without choosing one", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/subscription");
    const old = M.state.items.find((i) => !i.productTypeId);
    expect(old, "the demo shop has an item with no type").toBeTruthy();
    cleanup();
    await signedInApp(`/business/catalog/${old.id}/edit`);
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Renamed old item");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(M.state.items.find((i) => i.id === old.id)).toMatchObject({ name: "Renamed old item" }));
    expect(M.state.items.find((i) => i.id === old.id).productTypeId ?? null).toBeNull();
  });
});
