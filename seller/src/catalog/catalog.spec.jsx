import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setLatency } from "@epicmkt/backend";
import { blankItem } from "@epicmkt/shared";
import * as mock from "../api/mock.js";
import { CatalogPage } from "./CatalogPage.jsx";
import { Toaster } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";

setLatency(0);

const mount = async (path = "/business/catalog") => {
  const router = createMemoryRouter(
    [
      { path: "/business/catalog", element: <><CatalogPage /><Toaster /></> },
      { path: "/business/plan", element: <div>Plan page</div> },
      { path: "/elsewhere", element: <div>Elsewhere</div> },
    ],
    { initialEntries: [path] }
  );
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.queryByText(/Loading your catalog/)).not.toBeInTheDocument());
  return { router, user };
};

const seed = async (...names) => {
  const out = [];
  for (const [i, n] of names.entries()) out.push(await mock.createItem(blankItem({ name: n, price: 100 * (i + 1), sort: i, shortDescription: "ok" })));
  return out;
};

const nameInputs = () => screen.getAllByRole("textbox", { name: "Name" });
const saveText = () => document.querySelector("p[data-state]")?.textContent;

beforeEach(async () => {
  mock.resetMock();
  useToasts.getState().clear();
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  await mock.login("ES100001", "Demo-Passw0rd");
});

describe("first item", () => {
  test("shows the guided form, blocks an incomplete save, then saves and moves to the table", async () => {
    const { user } = await mount();
    expect(screen.getByRole("heading", { name: "Add your first item" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(/things need fixing|thing needs fixing/)).toBeInTheDocument();
    expect(await mock.listItems()).toHaveLength(0);

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Box braids");
    await user.type(screen.getByRole("textbox", { name: /Price \(KSh\)/ }), "2500");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("tablist", { name: "Catalog views" })).toBeInTheDocument();
    expect((await mock.listItems()).map((i) => i.name)).toEqual(["Box braids"]);
    expect(screen.getByRole("tab", { name: "Table", selected: true })).toBeInTheDocument();
    expect(screen.getByTestId("usage-meter")).toHaveTextContent("1 of 25 items");
  });

  test("whole KES only: letters and decimals cannot be typed into a price", async () => {
    const { user } = await mount();
    const price = screen.getByRole("textbox", { name: /Price \(KSh\)/ });
    await user.type(price, "12.5abc");
    expect(price).toHaveValue("125");
  });

  test("price type changes which price fields show", async () => {
    const { user } = await mount();
    await user.selectOptions(screen.getByLabelText("Price type"), "range");
    expect(screen.getByLabelText(/Lowest price/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Highest price/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Price type"), "contact");
    expect(screen.queryByLabelText(/^Price \(KSh\)/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sale price/)).not.toBeInTheDocument();
  });

  test("availability extras: seasonal needs dates, coming soon needs a date", async () => {
    const { user } = await mount();
    await user.selectOptions(screen.getByLabelText("Availability"), "seasonal");
    expect(screen.getByLabelText("Season starts")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Availability"), "coming_soon");
    expect(screen.getByLabelText("Expected date")).toBeInTheDocument();
    expect(screen.queryByLabelText("Season starts")).not.toBeInTheDocument();
  });

  test("stock tracking previews the automatic status and locks the availability picker", async () => {
    const { user } = await mount();
    await user.click(screen.getByRole("checkbox", { name: /Track how many I have/ }));
    await user.type(screen.getByLabelText("In stock now"), "2");
    expect(screen.getByText(/so this shows as Limited stock/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Availability/ })).toBeDisabled();
    await user.clear(screen.getByLabelText("In stock now"));
    await user.type(screen.getByLabelText("In stock now"), "0");
    expect(screen.getByText(/shows as Out of stock/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("In stock now"));
    await user.type(screen.getByLabelText("In stock now"), "40");
    expect(screen.getByText(/Status: Available/)).toBeInTheDocument();
  });

  test("service and membership blocks follow the item type", async () => {
    mock.setMockCategory("groceries");
    const { user } = await mount();
    expect(screen.getByLabelText("Type")).toHaveValue("product");
    expect(screen.queryByLabelText("Duration (minutes)")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type"), "service");
    expect(screen.getByLabelText("Duration (minutes)")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Home service available" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Appointment needed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a person" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add an add-on" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type"), "membership");
    expect(screen.queryByLabelText("Duration (minutes)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Term")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Joining fee \(KSh\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Trainer/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Peak price \(KSh\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Off-peak price \(KSh\)/)).toBeInTheDocument();
  });

  test("a category with no item-level extras shows no extras block at all (gyms, barbershops)", async () => {
    mock.setMockCategory("gyms");
    await mount();
    expect(screen.queryByRole("heading", { name: "Gyms details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Gyms details/ })).not.toBeInTheDocument();
    // none of the business-level gym fields leak onto an item
    expect(screen.queryByLabelText(/Personal trainers/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Equipment/ })).not.toBeInTheDocument();
    // a new gym item still defaults to the membership type and gets the built-in membership block
    expect(screen.getByLabelText("Type")).toHaveValue("membership");
    expect(screen.getByLabelText("Term")).toBeInTheDocument();
  });

  test("a category with item-level extras shows exactly those fields and none of the business fields (chemists)", async () => {
    mock.setMockCategory("chemists");
    await mount();
    const block = screen.getByRole("heading", { name: "Chemists details" }).closest("section");
    expect(within(block).getByRole("checkbox", { name: /Prescription required/ })).toBeInTheDocument();
    expect(within(block).getByLabelText(/^Form/)).toBeInTheDocument();
    expect(within(block).getByLabelText(/^Strength/)).toBeInTheDocument();
    expect(within(block).getByLabelText(/^Active ingredient/)).toBeInTheDocument();
    const shown = [...block.querySelectorAll("label")].map((l) => l.textContent.replace(/\(optional\)|Filter|On listing card/g, "").trim()).filter(Boolean);
    expect(shown.sort()).toEqual(["Active ingredient", "Form", "Prescription required", "Strength"].sort());
    // business-level chemist fields are absent everywhere on the form
    expect(screen.queryByLabelText(/Fills prescriptions/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Pharmacy licence/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Pharmacist on site/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Delivery/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Payment accepted/)).not.toBeInTheDocument();
    // and the guided form lists the block in its jump links
    expect(screen.getByRole("link", { name: /Chemists details/ })).toBeInTheDocument();
  });

  test("showIf inside an item template: the notice field appears only for made-to-order bakery items", async () => {
    mock.setMockCategory("bakery");
    const { user } = await mount();
    expect(screen.queryByLabelText(/^Notice needed/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Made to order/ }));
    expect(screen.getByLabelText(/^Notice needed/)).toBeInTheDocument();
  });

  test("variants, specs, included lines and tags can be added", async () => {
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Add an option" }));
    await user.type(screen.getByLabelText("Option name"), "Large");
    await user.click(screen.getByRole("button", { name: "Add a specification" }));
    await user.click(screen.getByRole("button", { name: "Add a line" }));
    await user.type(screen.getByLabelText("included line 1"), "Towel");
    const tags = screen.getByLabelText("Add to search tags");
    await user.type(tags, "mtungi{Enter}jerrycan,");
    expect(screen.getByText("mtungi")).toBeInTheDocument();
    expect(screen.getByText("jerrycan")).toBeInTheDocument();
  });

  test("a new section can be added from the form and is saved to the seller's list", async () => {
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "+ New section" }));
    await user.type(screen.getByLabelText("New section name"), "Braids");
    await user.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(screen.getByLabelText(/^Section/)).toHaveValue("Braids"));
    expect((await mock.getCatalogSettings()).sections).toEqual(["Braids"]);
  });
});

describe("table", () => {
  test("+ Add row appends a blank row and focuses its name", async () => {
    await seed("Alpha");
    const { user } = await mount();
    expect(nameInputs()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add row" }));
    expect(nameInputs()).toHaveLength(2);
    expect(nameInputs()[1]).toHaveFocus();
  });

  test("typing autosaves after a pause, shows saving then saved, and a nameless row is never created", async () => {
    await seed("Alpha");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    const name = nameInputs()[1];
    await user.type(name, "B");
    await new Promise((r) => setTimeout(r, 900));
    expect(await mock.listItems()).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Add a name to save this row." })).toBeInTheDocument();
    expect(saveText()).toBe("All changes saved");

    await user.type(name, "ravo");
    expect(saveText()).toBe("Saving…");
    await waitFor(async () => expect((await mock.listItems()).map((i) => i.name)).toEqual(["Alpha", "Bravo"]), { timeout: 4000 });
    await waitFor(() => expect(saveText()).toBe("All changes saved"));
  });

  test("Enter jumps to the next field, then the next row", async () => {
    await seed("Alpha", "Bravo");
    const { user } = await mount();
    nameInputs()[0].focus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("textbox", { name: "Price in KSh" })[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("combobox", { name: "Unit" })[0] ?? screen.getAllByRole("textbox", { name: "Unit" })[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("combobox", { name: "Availability" })[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(nameInputs()[1]).toHaveFocus();
  });

  test("inline validation: sale price must be below the price, and the bad value is not saved", async () => {
    const [a] = await seed("Alpha");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Show more fields for Alpha/ }));
    const panel = screen.getByRole("region", { name: /More details for Alpha/ });
    await user.type(within(panel).getByLabelText(/^Sale price \(KSh\)/), "500");
    expect(await within(panel).findByText("Must be lower than the normal price")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1000));
    expect((await mock.listItems())[0].salePrice).toBeNull();
    expect(screen.getByRole("button", { name: /Not saved/ })).toBeInTheDocument();
    expect(saveText()).toBe("Some changes could not be saved");
    await user.clear(within(panel).getByLabelText(/^Sale price \(KSh\)/));
    await user.type(within(panel).getByLabelText(/^Sale price \(KSh\)/), "50");
    await waitFor(async () => expect((await mock.listItems())[0].salePrice).toBe(50), { timeout: 4000 });
    expect(a.id).toBeTruthy();
  });

  test("the database decides stock-driven status: saving stock 2 with threshold 3 comes back as Limited stock", async () => {
    await seed("Alpha");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Show more fields for Alpha/ }));
    const panel = screen.getByRole("region", { name: /More details for Alpha/ });
    await user.click(within(panel).getByRole("checkbox", { name: /Track how many I have/ }));
    await user.type(within(panel).getByLabelText("In stock now"), "2");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Availability" })).toHaveValue("limited_stock"), { timeout: 4000 });
    expect(screen.getByRole("combobox", { name: "Availability" })).toBeDisabled();
    await waitFor(async () => expect((await mock.listItems())[0].availability).toBe("limited_stock"), { timeout: 4000 });
  });

  test("delete removes the row, Undo re-inserts the same row at the same place", async () => {
    const items = await seed("Alpha", "Bravo", "Charlie");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Delete Bravo" }));
    await waitFor(() => expect(nameInputs().map((i) => i.value)).toEqual(["Alpha", "Charlie"]));
    expect(await mock.listItems()).toHaveLength(2);
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(nameInputs().map((i) => i.value)).toEqual(["Alpha", "Bravo", "Charlie"]));
    const back = (await mock.listItems()).find((i) => i.name === "Bravo");
    expect(back.id).toBe(items[1].id);
  });

  test("delete waits for a pending save so nothing is resurrected", async () => {
    await seed("Alpha");
    const { user } = await mount();
    await user.type(nameInputs()[0], "x");
    await user.click(screen.getByRole("button", { name: /^Delete/ }));
    await new Promise((r) => setTimeout(r, 1000));
    expect(await mock.listItems()).toHaveLength(0);
  });

  test("duplicate copies fields into a new row right below, with its own id", async () => {
    const [a] = await seed("Alpha", "Bravo");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Duplicate Alpha" }));
    await waitFor(() => expect(nameInputs().map((i) => i.value)).toEqual(["Alpha", "Alpha (copy)", "Bravo"]), { timeout: 4000 });
    await waitFor(async () => expect((await mock.listItems()).map((i) => i.name)).toEqual(["Alpha", "Alpha (copy)", "Bravo"]), { timeout: 4000 });
    const list = await mock.listItems();
    expect(list[1].id).not.toBe(a.id);
    expect(list[1].price).toBe(100);
  });

  test("up and down buttons reorder and persist the order", async () => {
    await seed("Alpha", "Bravo", "Charlie");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Move Alpha down" }));
    expect(nameInputs().map((i) => i.value)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(screen.getByText("Moved Alpha to position 2 of 3.")).toBeInTheDocument();
    await waitFor(async () => expect((await mock.listItems()).map((i) => i.name)).toEqual(["Bravo", "Alpha", "Charlie"]));
    expect(screen.getByRole("button", { name: "Move Bravo up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Charlie down" })).toBeDisabled();
  });

  test("every row has a keyboard-reachable drag handle", async () => {
    await seed("Alpha", "Bravo");
    await mount();
    const h = screen.getByRole("button", { name: /Reorder Alpha/ });
    expect(h).toHaveAttribute("aria-roledescription", "sortable");
    h.focus();
    expect(h).toHaveFocus();
  });

  test("visible toggle saves", async () => {
    await seed("Alpha");
    const { user } = await mount();
    await user.click(screen.getByRole("switch", { name: /Visible to shoppers: Alpha/ }));
    await waitFor(async () => expect((await mock.listItems())[0].visible).toBe(false), { timeout: 4000 });
  });

  test("item extras appear in the expanded row, with their flags, and are saved to the item", async () => {
    mock.setMockCategory("eateries");
    await seed("Chicken stew");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Show more fields for Chicken stew/ }));
    const panel = screen.getByRole("region", { name: /More details for Chicken stew/ });
    expect(within(panel).getByLabelText(/^Spice level/)).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /Vegetarian/ })).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: /Halal/ })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Preparation time \(minutes\)/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Serves \(people\)/)).toBeInTheDocument();
    expect(within(panel).getAllByText("On listing card").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Filter").length).toBeGreaterThan(0);
    // eatery business fields (menu, seats, reservations ...) are not item fields
    expect(within(panel).queryByLabelText(/Seats/)).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText(/Reservations/)).not.toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText(/^Spice level/), "hot");
    await waitFor(async () => expect((await mock.listItems())[0].attributes["spice-level"]).toBe("hot"), { timeout: 4000 });
  });

  test("a barbershop item has no extras block in its expanded row", async () => {
    mock.setMockCategory("barbershops");
    await mock.createItem(blankItem({ name: "Fade", kind: "service", price: 300, shortDescription: "ok" }));
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Show more fields for Fade/ }));
    const panel = screen.getByRole("region", { name: /More details for Fade/ });
    expect(within(panel).queryByRole("heading", { name: "Barbershops details" })).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText(/^Booking/)).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText(/Barber chairs/)).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Service details" })).toBeInTheDocument();
  });

  test("legacy business-level attributes are ignored by the form, never block a save, and are stripped on the next save", async () => {
    mock.setMockCategory("chemists");
    const [a, b] = await seed("Panadol", "Untouched");
    mock.seedLegacyAttributes(a.id, { prescriptions: true, licence: "PPB/9", strength: "500 mg", delivery: true, "delivery-fee": 100 });
    mock.seedLegacyAttributes(b.id, { prescriptions: true });
    const { user } = await mount();

    await user.click(screen.getByRole("button", { name: /Show more fields for Panadol/ }));
    const panel = screen.getByRole("region", { name: /More details for Panadol/ });
    expect(within(panel).getByLabelText(/^Strength/)).toHaveValue("500 mg");
    expect(within(panel).queryByLabelText(/licence/i)).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText(/Delivery/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not part of this category/)).not.toBeInTheDocument();

    // untouched rows are not rewritten just because they hold legacy keys
    await new Promise((r) => setTimeout(r, 1000));
    expect(mock.mockItemRows().find((r) => r.id === a.id).attributes).toHaveProperty("licence");

    // the next edit saves successfully and drops the legacy keys, keeping the known one
    await user.type(screen.getAllByRole("textbox", { name: "Name" })[0], " Extra");
    await waitFor(() => expect(saveText()).toBe("All changes saved"), { timeout: 4000 });
    const saved = (await mock.listItems()).find((i) => i.id === a.id);
    expect(saved.name).toBe("Panadol Extra");
    expect(saved.attributes).toEqual({ strength: "500 mg" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // the other item still has its legacy data until someone edits it
    expect(mock.mockItemRows().find((r) => r.id === b.id).attributes).toEqual({ prescriptions: true });
  });
});

describe("plan usage", () => {
  test("meter reads 'N of M items' and the prompt appears at the limit", async () => {
    mock.setMockLimit(2);
    await seed("Alpha", "Bravo");
    const { user } = await mount();
    expect(screen.getByTestId("usage-meter")).toHaveTextContent("2 of 2 items");
    expect(screen.getByRole("progressbar", { name: /Items used/ })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("alert")).toHaveTextContent(/used all 2 items/);
    expect(screen.getByRole("link", { name: "See Premium" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    expect(nameInputs()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Duplicate Alpha" }));
    expect(nameInputs()).toHaveLength(2);
  });

  test("the database's item_limit_reached error shows the same prompt", async () => {
    mock.setMockLimit(5);
    await seed("Alpha");
    const { user } = await mount();
    expect(screen.queryByRole("link", { name: "See Premium" })).not.toBeInTheDocument();
    mock.setMockLimit(1);
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(nameInputs()[1], "Bravo");
    expect(await screen.findByRole("link", { name: "See Premium" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Your plan is full/)).toBeInTheDocument();
    expect(await mock.listItems()).toHaveLength(1);
  });

  test("undo respects a full plan", async () => {
    mock.setMockLimit(2);
    await seed("Alpha", "Bravo");
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Delete Bravo" }));
    await screen.findByRole("button", { name: "Undo" });
    await mock.createItem(blankItem({ name: "Sneaky", sort: 5 }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText(/plan is full, so this could not be restored/)).toBeInTheDocument();
  });
});

describe("tabs", () => {
  test("Needs attention lists items with problems and Fix focuses the row", async () => {
    await mock.createItem(blankItem({ name: "No price", sort: 0 }));
    await mock.createItem(blankItem({ name: "Fine", price: 100, sort: 1, shortDescription: "ok" }));
    const { user } = await mount();
    await user.click(screen.getByRole("tab", { name: /Needs attention/ }));
    const list = await screen.findByRole("list", { name: "" }).catch(() => null);
    expect(screen.getByText("No price yet")).toBeInTheDocument();
    expect(screen.queryByText("Fine")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Fix No price in the table/ }));
    expect(screen.getByRole("tab", { name: "Table", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(nameInputs()[0]).toHaveFocus());
    void list;
  });

  test("History shows recorded price changes with who made them", async () => {
    const [a] = await seed("Alpha");
    await mock.updateItem(a.id, { ...a, price: 250 });
    const { user } = await mount();
    await user.click(screen.getByRole("tab", { name: "History" }));
    const entry = await screen.findByText(/KSh 100\s+KSh 250/);
    expect(entry).toBeInTheDocument();
    expect(screen.getByText(/· You$/)).toBeInTheDocument();
  });

  test("tabs are Table, Needs attention and History, and arrow keys move between them", async () => {
    await seed("Alpha");
    const { user } = await mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent.replace(/\d+$/, ""))).toEqual(["Table", "Needs attention", "History"]);
    screen.getByRole("tab", { name: "Table" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Needs attention/, selected: true })).toHaveFocus();
  });
});

describe("sections dialog", () => {
  test("add and reorder sections; a section in use cannot be removed", async () => {
    await mock.saveCatalogSettings({ sections: ["Cuts", "Braids"] });
    await mock.createItem(blankItem({ name: "Fade", section: "Cuts", sort: 0 }));
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "Sections" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Remove Cuts" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New section"), "Wigs");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(async () => expect((await mock.getCatalogSettings()).sections).toEqual(["Cuts", "Braids", "Wigs"]));
    await user.click(within(dialog).getByRole("button", { name: "Move Wigs up" }));
    await waitFor(async () => expect((await mock.getCatalogSettings()).sections).toEqual(["Cuts", "Wigs", "Braids"]));
    await user.click(within(dialog).getByRole("button", { name: "Remove Braids" }));
    await waitFor(async () => expect((await mock.getCatalogSettings()).sections).toEqual(["Cuts", "Wigs"]));
  });
});

describe("unsaved changes", () => {
  test("leaving with unsaved work asks first; Stay keeps the page, Leave proceeds", async () => {
    await seed("Alpha");
    const { user, router } = await mount();
    await user.type(nameInputs()[0], "zzz");
    await act(async () => { router.navigate("/elsewhere"); });
    const dialog = await screen.findByRole("dialog", { name: "You have unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Stay here" }));
    expect(router.state.location.pathname).toBe("/business/catalog");
    await act(async () => { router.navigate("/elsewhere"); });
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
    expect((await mock.listItems())[0].name).toBe("Alphazzz");
  });

  test("a clean page leaves without a prompt, and beforeunload is only armed while dirty", async () => {
    await seed("Alpha");
    const { user, router } = await mount();
    const add = vi.spyOn(window, "addEventListener");
    await user.type(nameInputs()[0], "q");
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    await waitFor(() => expect(saveText()).toBe("All changes saved"), { timeout: 4000 });
    await act(async () => { router.navigate("/elsewhere"); });
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
    add.mockRestore();
  });
});

describe("phones", () => {
  beforeEach(() => {
    window.matchMedia = (q) => ({ matches: /max-width: 759px/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  });

  test("rows are cards that expand on tap, with a large Add row button", async () => {
    await seed("Alpha");
    const { user } = await mount();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Your items" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    const card = screen.getByRole("button", { name: /Alpha/, expanded: false });
    expect(card).toHaveTextContent("KSh 100");
    await user.click(card);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Alpha");
    expect(screen.getByRole("button", { name: "Duplicate Alpha" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "Name" })).toHaveLength(2));
    expect(screen.getAllByRole("textbox", { name: "Name" })[1]).toHaveFocus();
  });
});
