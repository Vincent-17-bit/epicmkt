import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductCard } from "@epicmkt/ui";
import { joinSignals, showingSummary, summaryText, trackerCounts } from "@epicmkt/shared";
import { freshSession, renderApp, signInAs } from "../test/helpers.jsx";
import * as mock from "../api/mock.js";
import { useSession } from "../state/session.js";
import ItemCard from "./ItemCard.jsx";
import { cardLabels, toCardItem } from "./cardModel.js";

beforeEach(freshSession);

const open = async (id, path = "/catalog") => {
  await signInAs(id);
  const view = renderApp(path);
  await screen.findByTestId("showing-summary");
  return view;
};

const cards = () => within(screen.getByRole("list", { name: "Your items" })).queryAllByRole("listitem");
const tracker = () => screen.getByRole("list", { name: "Catalog counts" });
const tile = (label) => within(tracker()).getByRole("button", { name: new RegExp(`${label}$`) });
const tileCount = (label) => Number(within(tile(label)).getByText(/^\d+$/).textContent);
const search = () => new URLSearchParams(window.location.search);
const raw = async () => {
  const res = await mock.listItems();
  return { ...res, items: joinSignals(res.items, res.signals) };
};

describe("cards use the real customer ProductCard", () => {
  it("renders exactly the markup the customer card renders", async () => {
    await signInAs("ES100002");
    const { items } = await raw();
    const item = items.find((i) => i.name === "Fade Cut");
    const ctx = { now: Date.now(), staleDays: 90 };
    const noop = () => {};
    const { container: seller } = render(
      <ItemCard item={item} ctx={ctx} selected={false} onSelect={noop} onMove={noop} onEdit={noop} onDuplicate={noop} onToggle={noop} onConfirm={noop} onView={noop} drag={{}} />
    );
    const { container: customer } = render(<ProductCard item={toCardItem(item)} labels={cardLabels(item.availability)} onSelect={noop} />);
    expect(seller.querySelector("[data-card]").outerHTML).toBe(customer.querySelector("[data-card]").outerHTML);
    expect(seller.querySelector("[data-slot='overlay']")).not.toBeNull();
    expect(seller.querySelector("[data-slot='quick-actions']")).not.toBeNull();
  });

  it("offers the five quick actions", async () => {
    await open("ES100002");
    const first = cards()[0];
    for (const name of ["Edit", "Duplicate", "Hide", "Confirm price", "View as customer"]) expect(within(first).getByRole("button", { name })).toBeInTheDocument();
  });
});

describe("marks on cards", () => {
  it("marks admin hidden, flagged, reported, stale, low stock and own hidden items", async () => {
    await open("ES100005");
    const grid = screen.getByRole("list", { name: "Your items" });
    const ribbon = within(grid).getAllByTestId("ribbon").find((r) => r.dataset.tone === "admin");
    expect(ribbon).toHaveTextContent("Hidden by admin");
    expect(ribbon.closest("[data-visibility]").querySelector('[data-testid="reason"]')).toHaveTextContent("Price looked misleading. Contact support to appeal.");
    expect(within(grid).getAllByRole("img", { name: "Flagged" }).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText(/^\d+ reports?$/).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText("Price may be out of date").length).toBeGreaterThan(0);
    expect(within(grid).getAllByText(/^Low stock: \d+ left$/).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText("Hidden by me", { selector: "strong" }).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText("Draft", { selector: "strong" }).length).toBeGreaterThan(0);
    const dimmed = grid.querySelectorAll('[data-dimmed="true"]');
    expect(dimmed.length).toBeGreaterThan(0);
  });

  it("locks Hide and Confirm price on admin hidden items and keeps the ribbon read-only", async () => {
    await open("ES100005");
    const cell = [...document.querySelectorAll('[data-visibility="hidden_by_admin"]')][0];
    expect(within(cell).getByRole("button", { name: /Show|Hide/ })).toBeDisabled();
    expect(within(cell).getByRole("button", { name: "Confirm price" })).toBeDisabled();
    expect(within(cell).getByTestId("ribbon").querySelector("button")).toBeNull();
  });
});

describe("showing to customers", () => {
  it("says N of M and why the others are not", async () => {
    await open("ES100005");
    const { items } = await raw();
    const expected = summaryText(showingSummary(items, { shopLive: false }));
    expect(screen.getByTestId("showing-summary")).toHaveTextContent(expected);
    expect(screen.getByRole("note")).toHaveTextContent("so no item is showing to customers");
  });

  it("counts a live shop", async () => {
    await open("ES100002");
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("40 of 40 items are showing to customers.");
  });

  it("changes after hiding items", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Bulk actions" })).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(screen.getByTestId("showing-summary")).toHaveTextContent("39 of 40 items are showing to customers. 1 hidden by you."));
  });
});

describe("tracker", () => {
  it("every tile count matches the cards its filter shows and the real data", async () => {
    await open("ES100005");
    const { items } = await raw();
    const expected = trackerCounts(items, { now: Date.now(), staleDays: 90 });
    const labels = { Total: "total", Available: "available", "Limited stock": "limited_stock", "Out of stock": "out_of_stock", Seasonal: "seasonal", "By appointment": "by_appointment", "Coming soon": "coming_soon", "Hidden by me": "hidden_by_me", "Hidden by admin": "hidden_by_admin", Drafts: "drafts", "No photo": "no_photo", "Stale prices": "stale_prices", "Low stock": "low_stock", Reported: "reported", Flagged: "flagged" };
    for (const [label, key] of Object.entries(labels)) {
      expect(tileCount(label)).toBe(expected[key]);
      await userEvent.click(tile(label));
      await waitFor(() => expect(cards()).toHaveLength(expected[key]) );
      expect(tile(label)).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("clicking a tile puts the filter in the URL", async () => {
    const { router } = await open("ES100005");
    await userEvent.click(tile("Hidden by admin"));
    await waitFor(() => expect(router.state.location.search).toContain("vis=hidden_by_admin"));
    await userEvent.click(tile("Flagged"));
    await waitFor(() => expect(router.state.location.search).toContain("iss=flagged"));
    expect(router.state.location.search).not.toContain("vis=");
  });
});

describe("search, filters, sort and URL state", () => {
  it("searches partial words after a short delay", async () => {
    await open("ES100002");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search your items" }), "kid");
    await waitFor(() => expect(cards().length).toBeLessThan(40));
    cards().forEach((c) => expect(c).toHaveTextContent(/kids/i));
    expect(screen.getByTestId("result-count")).toHaveTextContent(`${cards().length} of 40 items`);
  });

  it("slash focuses the search box", async () => {
    await open("ES100002");
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveFocus();
  });

  it("restores every kind of state from the URL", async () => {
    await open("ES100005", "/catalog?q=cut&av=available,seasonal&sort=price_desc&pmin=100&sale=1");
    const chips = within(screen.getByRole("list", { name: "Active filters" }));
    for (const label of ["Search: cut", "Available", "Seasonal", "From KSh 100", "On sale"]) expect(chips.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("price_desc");
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("cut");
    const prices = cards().map((c) => Number(/KSh\s([\d,]+)/.exec(c.textContent)?.[1].replace(/,/g, "")));
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it("removes chips and clears everything with a count", async () => {
    const { router } = await open("ES100002", "/catalog?av=limited_stock&iss=flagged");
    expect(screen.getByTestId("result-count")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove filter Flagged" }));
    await waitFor(() => expect(router.state.location.search).toBe("?av=limited_stock"));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(cards()).toHaveLength(40);
  });

  it("combines section, availability and sort", async () => {
    await open("ES100002", "/catalog?section=Cuts&av=limited_stock&sort=name_asc");
    const { items } = await raw();
    const expected = items.filter((i) => i.section === "Cuts" && i.availability === "limited_stock").map((i) => i.name).sort((a, b) => a.localeCompare(b));
    expect(cards().map((c) => within(c).getByRole("checkbox").getAttribute("aria-label").replace("Select ", ""))).toEqual(expected);
  });

  it("shows the no-results state with a way out", async () => {
    await open("ES100002", "/catalog?q=zzzzzz");
    expect(screen.getByRole("heading", { name: "No items match" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await waitFor(() => expect(cards()).toHaveLength(40));
  });
});

describe("view modes and layout", () => {
  it("remembers the mode on this device", async () => {
    const first = await open("ES100002");
    await userEvent.click(screen.getByRole("button", { name: "Compact grid" }));
    expect(screen.getByRole("list", { name: "Your items" })).toHaveAttribute("data-mode", "compact");
    expect(window.localStorage.getItem("epicmkt-seller-listings-mode")).toBe("compact");
    first.unmount();
    renderApp("/catalog");
    await screen.findByTestId("showing-summary");
    expect(screen.getByRole("button", { name: "Compact grid" })).toHaveAttribute("aria-pressed", "true");
  });

  it("paginates beyond 60 cards", async () => {
    await signInAs("ES100002");
    await mock.importItems(Array.from({ length: 30 }, (_, i) => ({ name: `Extra item ${i}`, price: 100 + i })));
    renderApp("/catalog");
    await screen.findByTestId("showing-summary");
    expect(cards()).toHaveLength(60);
    expect(screen.getByText("Showing 60 of 70")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show 10 more" }));
    expect(cards()).toHaveLength(70);
  });
})

describe("phone filter sheet", () => {
  it("applies only on Apply and resets the draft", async () => {
    const { router } = await open("ES100002");
    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Limited stock" }));
    expect(router.state.location.search).toBe("");
    await userEvent.click(within(sheet).getByRole("button", { name: "Reset" }));
    expect(within(sheet).getByRole("checkbox", { name: "Limited stock" })).not.toBeChecked();
    await userEvent.click(within(sheet).getByRole("checkbox", { name: "Limited stock" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(router.state.location.search).toBe("?av=limited_stock"));
    expect(cards()).toHaveLength(3);
  });
});

describe("saved views", () => {
  it("saves, validates, applies and deletes", async () => {
    const { router } = await open("ES100002");
    await userEvent.click(tile("Flagged"));
    await userEvent.click(screen.getByRole("button", { name: "Saved views" }));
    const dialog = await screen.findByRole("dialog", { name: "Saved views" });
    await userEvent.type(within(dialog).getByLabelText("Save current view as"), "<b>");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save view" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Use letters, numbers");
    await userEvent.clear(within(dialog).getByLabelText("Save current view as"));
    await userEvent.type(within(dialog).getByLabelText("Save current view as"), "Needs a look");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save view" }));
    await within(dialog).findByRole("button", { name: "Needs a look" });
    expect((await mock.me()).settings.saved_views).toEqual([expect.objectContaining({ name: "Needs a look", params: "iss=flagged" })]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await userEvent.click(screen.getByRole("button", { name: "Saved views" }));
    await userEvent.click(await screen.findByRole("button", { name: "Needs a look" }));
    await waitFor(() => expect(router.state.location.search).toBe("?iss=flagged"));
  });

  it("stops at ten views", async () => {
    await open("ES100002");
    await mock.saveViews(Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, name: `View ${i}`, params: "sort=name_asc" })));
    await useSession.getState().refresh();
    await userEvent.click(screen.getByRole("button", { name: "Saved views" }));
    const dialog = await screen.findByRole("dialog", { name: "Saved views" });
    expect(await within(dialog).findByText("10 of 10 views saved.")).toBeInTheDocument();
  });
});

describe("bulk actions", () => {
  it("previews prices exactly as they are written, including whole shilling rounding", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Kids Cut" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    await userEvent.click(within(bar).getByRole("button", { name: "Change prices" }));
    const dialog = await screen.findByRole("dialog", { name: "Change prices" });
    const percent = within(dialog).getByLabelText("By percent");
    await userEvent.clear(percent);
    await userEvent.type(percent, "12.5");
    expect(within(dialog).getByText(/rounded to the nearest whole shilling/i)).toBeInTheDocument();
    expect(within(dialog).getByTestId("price-summary")).toHaveTextContent("2 items will change");
    const shown = Object.fromEntries(["ES100002-i001", "ES100002-i002"].map((id) => [id, within(dialog).getByTestId(`after-${id}`).textContent]));
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to 2 items" }));
    expect(await screen.findByText("Prices changed for 2 items")).toBeInTheDocument();
    const { items } = await raw();
    for (const id of Object.keys(shown)) {
      const now = items.find((i) => i.id === id);
      expect(shown[id]).toBe(`KSh ${now.price.toLocaleString("en-KE")}`);
    }
    expect(items.find((i) => i.id === "ES100002-i001").price).toBe(675);
    expect(items.find((i) => i.id === "ES100002-i002").price).toBe(394);
  });

  it("changes nothing when the server refuses", async () => {
    await open("ES100002");
    const before = (await raw()).items.map((i) => [i.id, i.price]);
    await expect(mock.bulkItems("price_percent", ["ES100002-i001", "missing"], { percent: 10, direction: "raise" })).rejects.toMatchObject({ code: "item_not_found" });
    await expect(mock.bulkItems("price_percent", ["ES100002-i001"], { percent: 900, direction: "raise" })).rejects.toMatchObject({ code: "invalid_percent" });
    expect((await raw()).items.map((i) => [i.id, i.price])).toEqual(before);
  });

  it("deletes with an undo that restores the item", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Bulk actions" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select Fade Cut" })).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("checkbox", { name: "Select Fade Cut" })).toBeInTheDocument();
    expect((await raw()).items).toHaveLength(40);
  });

  it("really deletes when the page is left without undoing", async () => {
    const view = await open("ES100002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Bulk actions" })).getByRole("button", { name: "Delete" }));
    view.unmount();
    await waitFor(async () => expect((await raw()).items).toHaveLength(39));
  });

  it("moves to a section and sets availability for the selection", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    await userEvent.click(within(bar).getByRole("button", { name: "Move to section" }));
    const move = await screen.findByRole("dialog", { name: "Move to section" });
    await userEvent.type(within(move).getByLabelText("Section name"), "Specials");
    await userEvent.click(within(move).getByRole("button", { name: "Move" }));
    await waitFor(async () => expect((await raw()).items.find((i) => i.id === "ES100002-i001").section).toBe("Specials"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Fade Cut" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Bulk actions" })).getByRole("button", { name: "Set availability" }));
    const av = await screen.findByRole("dialog", { name: "Set availability" });
    await userEvent.selectOptions(within(av).getByLabelText("Availability"), "seasonal");
    await userEvent.click(within(av).getByRole("button", { name: "Apply" }));
    await waitFor(async () => expect((await raw()).items.find((i) => i.id === "ES100002-i001").availability).toBe("seasonal"));
  });
});

describe("paste and CSV import", () => {
  const paste = async (text) => {
    await userEvent.click(screen.getByRole("button", { name: /^Import/ }));
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: text } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Read rows" }));
    return dialog;
  };

  it("is locked with an upgrade prompt on Standard", async () => {
    await open("ES100001");
    await userEvent.click(screen.getByRole("button", { name: "Import (Premium)" }));
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    expect(within(dialog).getByText(/part of the Premium plan/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/subscription");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await expect(mock.importItems([{ name: "Sneaky", price: 1 }])).rejects.toMatchObject({ code: "premium_only" });
  });

  it("validates each row before importing and creates hidden drafts", async () => {
    await open("ES100002");
    const dialog = await paste("Name\tPrice\tUnit\tSection\tAvailability\nGel pot\t200\tpot\tProducts\tin stock\n=HYPERLINK(1)\t100\t\t\t\nBad price\tabc\t\t\t\nMr Brush\t350\tpiece\tProducts\tseasonal");
    expect(within(dialog).getByTestId("import-summary")).toHaveTextContent("2 ready to import, 2 refused.");
    const rows = within(dialog).getAllByRole("row");
    expect(rows[2]).toHaveTextContent(/starts with =, \+, - or @/);
    expect(rows[3]).toHaveTextContent(/Price: must be a number/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 items" }));
    await waitFor(async () => expect((await raw()).items).toHaveLength(42));
    const drafts = (await raw()).items.filter((i) => i.name === "Gel pot" || i.name === "Mr Brush");
    expect(drafts.every((i) => i.draft && !i.visible)).toBe(true);
    expect(await screen.findByText(/2 items imported as hidden drafts/)).toBeInTheDocument();
  });

  it("refuses rows over the plan limit with a clear message", async () => {
    await open("ES100002");
    const lines = ["Name\tPrice", ...Array.from({ length: 61 }, (_, i) => `Bulk item ${i}\t${100 + i}`)].join("\n");
    const dialog = await paste(lines);
    expect(within(dialog).getByTestId("import-summary")).toHaveTextContent("60 ready to import, 1 refused. 1 row is over your plan limit and will not be imported.");
    await expect(mock.importItems(Array.from({ length: 61 }, (_, i) => ({ name: `Bulk item ${i}`, price: 100 })))).rejects.toMatchObject({ code: "limit_reached:items" });
    expect((await raw()).items).toHaveLength(40);
  });

  it("refuses more than 500 rows and files over 2 MB", async () => {
    await open("ES100002");
    const lines = ["Name\tPrice", ...Array.from({ length: 501 }, (_, i) => `Item ${i}\t100`)].join("\n");
    const dialog = await paste(lines);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("501 rows. The limit is 500 rows at a time.");
    await userEvent.click(within(dialog).getByRole("tab", { name: "Upload a CSV" }));
    const big = new File(["a".repeat(10)], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 + 1 });
    await userEvent.upload(within(dialog).getByLabelText(/Choose a CSV file/), big);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("larger than 2 MB");
  });

  it("reads an uploaded CSV and offers the error report", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("button", { name: /^Import/ }));
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "Upload a CSV" }));
    const file = new File(['Product,Cost,Category\nSoap,150,Products\n@bad,10,Products\n'], "items.csv", { type: "text/csv" });
    await userEvent.upload(within(dialog).getByLabelText(/Choose a CSV file/), file);
    expect(await within(dialog).findByTestId("import-summary")).toHaveTextContent("1 ready to import, 1 refused.");
    expect(within(dialog).getByLabelText("Name (required)")).toHaveValue("0");
    expect(within(dialog).getByRole("button", { name: "Download error report" })).toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("guides a seller with no items", async () => {
    await signInAs("ES100004");
    renderApp("/catalog");
    expect(await screen.findByRole("heading", { name: "Add your first item" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first item" })).toHaveAttribute("href", "/catalog/items/new");
    expect(screen.getByRole("button", { name: "Import from a sheet (Premium)" })).toBeInTheDocument();
  });

  it("explains a shop that is not live", async () => {
    await open("ES100005");
    expect(screen.getByRole("note")).toHaveTextContent("Your shop is hidden");
    expect(within(screen.getByRole("note")).getByRole("link", { name: "Renew" })).toBeInTheDocument();
  });
});

describe("reorder", () => {
  it("moves an item with the arrows and keeps the new order", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("button", { name: "Move Fade Cut down" }));
    await waitFor(() => expect(within(cards()[0]).getByRole("checkbox")).toHaveAttribute("aria-label", "Select Kids Cut"));
    const { items } = await raw();
    expect(items.find((i) => i.id === "ES100002-i001").sort).toBe(2);
  });

  it("only offers reordering in manual order without filters", async () => {
    await open("ES100002", "/catalog?sort=name_asc");
    expect(screen.queryByRole("button", { name: /Move .* down/ })).toBeNull();
  });
});
