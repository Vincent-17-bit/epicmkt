import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import * as api from "../../../api/index.js";
import * as mock from "../../../api/mock.js";
import { signedInApp } from "../../../test/utils.jsx";
import NameChips from "../../../components/NameChips.jsx";
import DuplicateGuard, { findSimilar } from "../../../components/DuplicateGuard.jsx";
import MemoryChips from "../../../components/MemoryChips.jsx";
import { remember } from "../../../lib/shopMemory.js";
import ToFinish from "./ToFinish.jsx";
import { toFinishList } from "./toFinish.js";
import { Grid } from "./TableAdd.jsx";
import { columnsFor, parsePaste, pasteInto, blankRow, rowProblems } from "./tableAdd.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const serious = async (node) => (await axe(node)).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id);

const BULB = {
  id: "pt-bulb", name: "Bulb",
  specRows: [
    { key: "wattage", label: "Wattage", level: "required", input: "text" },
    { key: "base", label: "Base", level: "required", input: "choice", choices: ["E27", "E14", "B22"] }
  ]
};
const wrap = (ui, path = "/") => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>
);

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("table model", () => {
  it("has a column for the name, price, stock and each required row", () => {
    expect(columnsFor(BULB).map((c) => c.label)).toEqual(["Name", "Price (KES)", "Stock", "Wattage", "Base"]);
  });
  it("reads pasted spreadsheet text and drops the trailing blank line", () => {
    expect(parsePaste("A\t1\nB\t2\n")).toEqual([["A", "1"], ["B", "2"]]);
  });
  it("pastes 20 rows into the table and finds the 3 invalid ones", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Bulb ${i + 1}\t${150 + i}\t10\t9 W\tE27`);
    lines[3] = "X\t150\t10\t9 W\tE27"; // name too short
    lines[8] = "Bulb 9\t\t10\t9 W\tE27"; // no price
    lines[14] = "Bulb 15\t150\t10\t\tE27"; // no wattage
    const { rows } = pasteInto([blankRow()], columnsFor(BULB), { row: 0, col: 0 }, parsePaste(lines.join("\n")));
    expect(rows).toHaveLength(20);
    expect(rows.filter((r) => rowProblems(r, BULB).length).length).toBe(3);
    expect(rowProblems(rows[14], BULB)).toEqual(["Wattage is required"]);
  });
});

describe("table add", () => {
  const ready = async () => { mock.resetMock(); await api.login("ES100001", "Demo-Passw0rd"); };

  it("moves between cells with the arrow keys and Enter", async () => {
    await ready();
    const user = userEvent.setup();
    render(wrap(<Grid type={BULB} onChange={() => {}} onDone={() => {}} />));
    const name1 = screen.getByLabelText("Name, row 1");
    await user.click(name1);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Name, row 2")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Name, row 3")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByLabelText("Name, row 2")).toHaveFocus();
  });

  it("pastes 20 rows, saves the good ones, and keeps the bad row in the table", async () => {
    await ready();
    const save = vi.spyOn(mock, "saveItem");
    const show = vi.spyOn(mock, "bulkItems").mockResolvedValue({ affected: 1 });
    const onDone = vi.fn();
    render(wrap(<Grid type={BULB} onChange={() => {}} onDone={onDone} />));
    const lines = Array.from({ length: 20 }, (_, i) => `Bulb ${i + 1}\t${150 + i}\t10\t9 W\tE27`);
    lines[3] = "X\t150\t10\t9 W\tE27";
    lines[8] = "Bulb 9\t\t10\t9 W\tE27";
    lines[14] = "Bulb 15\t150\t10\t\tE27";
    fireEvent.paste(screen.getByLabelText("Name, row 1"), { clipboardData: { getData: () => lines.join("\n") } });
    expect(await screen.findByText("Pasted 20 rows.")).toBeInTheDocument();
    expect(within(screen.getByText("Wattage is required").closest("tr")).getByLabelText("Name, row 15")).toHaveValue("Bulb 15");
    await userEvent.setup().click(screen.getByRole("button", { name: /Save 20 items \(3 to finish\)/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("19 saved (2 as drafts). 1 row needs your attention."), { timeout: 10000 });
    expect(save).toHaveBeenCalledTimes(19);
    expect(show).toHaveBeenCalledTimes(17);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name, row 1")).toHaveValue("X");
  });

  it("goes back to the list when everything is saved", async () => {
    await ready();
    vi.spyOn(mock, "bulkItems").mockResolvedValue({ affected: 1 });
    const onDone = vi.fn();
    render(wrap(<Grid type={BULB} onChange={() => {}} onDone={onDone} />));
    fireEvent.paste(screen.getByLabelText("Name, row 1"), { clipboardData: { getData: () => "Bulb A\t100\t5\t9 W\tE27\nBulb B\t110\t5\t12 W\tE14" } });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Save 2 items" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ tone: "ok", text: "2 added." }));
  });

  it("has no serious accessibility violations", async () => {
    await ready();
    const { container } = render(wrap(<Grid type={BULB} onChange={() => {}} onDone={() => {}} />));
    expect(await serious(container)).toEqual([]);
  });
});

describe("fill from the name", () => {
  const rows = BULB.specRows;
  it("offers chips, and accepting one passes the row and value on", async () => {
    const onAccept = vi.fn();
    render(<NameChips name="Philips LED bulb 9W E27" rows={rows} has={() => false} onAccept={onAccept} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Use E27 for Base" }));
    expect(onAccept).toHaveBeenCalledWith(rows[1], "E27");
    expect(screen.getByRole("button", { name: "Use 9 W for Wattage" })).toBeInTheDocument();
  });
  it("shows nothing once the rows are answered or the name says nothing", () => {
    const { container, rerender } = render(<NameChips name="Philips LED bulb 9W E27" rows={rows} has={() => true} onAccept={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<NameChips name="Fade cut" rows={rows} has={() => false} onAccept={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("duplicate guard", () => {
  const items = [{ id: "it-1", name: "Philips LED bulb 9W" }, { id: "it-2", name: "Fade cut" }];
  it("finds the same item written another way", () => {
    expect(findSimilar("philips led BULB 9w", items)?.id).toBe("it-1");
    // A different wattage of the same bulb is the case the guard is for: it belongs as an option of the item the shop already sells.
    expect(findSimilar("Philips LED bulb 12W", items)?.id).toBe("it-1");
    expect(findSimilar("Osram LED bulb 9W", items)).toBeNull();
    expect(findSimilar("Philips LED bulb 9W", items, "it-1")).toBeNull();
  });
  it("asks, links to the options step, and can be dismissed", async () => {
    await (async () => { mock.resetMock(); await api.login("ES100001", "Demo-Passw0rd"); })();
    vi.spyOn(api, "getCatalog").mockResolvedValue({ shop: {}, items });
    render(wrap(<DuplicateGuard checked="Philips LED bulb 9W" />));
    const box = await screen.findByTestId("duplicate-guard");
    expect(box).toHaveTextContent("You already sell Philips LED bulb 9W. Add this as another option instead?");
    expect(within(box).getByRole("link", { name: "Add as an option" })).toHaveAttribute("href", "/business/catalog/it-1/edit");
    await userEvent.setup().click(within(box).getByRole("button", { name: "No, this is different" }));
    expect(screen.queryByTestId("duplicate-guard")).toBeNull();
  });
  it("stays quiet before the seller leaves the name box", () => {
    vi.spyOn(api, "getCatalog").mockResolvedValue({ shop: {}, items });
    render(wrap(<DuplicateGuard checked="" />));
    expect(screen.queryByTestId("duplicate-guard")).toBeNull();
  });
});

describe("shop memory chips", () => {
  it("offers the last brands for the type and picks one", async () => {
    remember("pt-bulb", { brand: "Philips" });
    remember("pt-bulb", { brand: "Osram" });
    const onPick = vi.fn();
    render(<MemoryChips typeId="pt-bulb" field="brand" label="brands" current="" onPick={onPick} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Philips" }));
    expect(onPick).toHaveBeenCalledWith("Philips");
    expect(screen.getByRole("group", { name: "Last brands:" })).toBeInTheDocument();
  });
  it("hides the value already in the field", () => {
    remember("pt-bulb", { brand: "Philips" });
    render(<MemoryChips typeId="pt-bulb" field="brand" label="brands" current="philips" onPick={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("To finish", () => {
  const draft = (over) => ({ id: "d1", name: "Draft bulb", draft: true, imageCount: 0, priceType: "fixed", price: null, specs: [], ...over });
  it("lists each draft with what is missing, the emptiest first", () => {
    const list = toFinishList([draft({}), draft({ id: "d2", name: "Almost", imageCount: 1, price: 100, productTypeId: "pt-bulb", specs: [{ label: "Wattage", value: "9 W" }, { label: "Base", value: "E27" }] }), { ...draft({ id: "v" }), draft: false }], [BULB]);
    expect(list.map((x) => x.item.id)).toEqual(["d1", "d2"]);
    expect(list[0].missing).toEqual(["A photo", "A price"]);
    expect(list[1].missing).toEqual([]);
  });
  it("counts the drafts and links into the editor", () => {
    render(wrap(<ToFinish items={[draft({}), draft({ id: "d3", name: "Second" })]} types={[]} />));
    expect(screen.getByRole("heading", { name: "2 items to finish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Draft bulb/ })).toHaveAttribute("href", "/business/catalog/d1/edit");
    expect(screen.getAllByText("Needs: A photo, A price")).toHaveLength(2);
  });
  it("renders nothing without drafts", () => {
    const { container } = render(wrap(<ToFinish items={[{ ...draft({}), draft: false }]} types={[]} />));
    expect(container).toBeEmptyDOMElement();
  });
  it("has no serious accessibility violations", async () => {
    const { container } = render(wrap(<ToFinish items={[draft({})]} types={[]} />));
    expect(await serious(container)).toEqual([]);
  });
});

describe("Add items entry", () => {
  it("shows the four ways in, and copying an item opens the copy as a draft", async () => {
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/add");
    expect(await screen.findByRole("heading", { name: "What are you adding?" })).toBeInTheDocument();
    for (const name of [/One item, guided/, /Many of the same kind/, /Import a file/, /Copy an item/]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    const spy = vi.spyOn(mock, "duplicateItem");
    await user.click(screen.getByRole("button", { name: /Copy an item/ }));
    const search = await screen.findByLabelText("Find the item to copy");
    const entries = await waitFor(() => {
      const found = within(search.parentElement).getAllByRole("listitem");
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    await user.click(within(entries[0]).getByRole("button"));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/business\/catalog\/.+\/edit$/));
  });
  it("sends many-of-the-same-kind to the table page", async () => {
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/add");
    await user.click(await screen.findByRole("button", { name: /Many of the same kind/ }));
    expect(router.state.location.pathname).toBe("/business/catalog/add/table");
  });
});
