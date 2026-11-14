import { describe, it, expect } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp, M } from "../../../test/utils.jsx";
import { applyPaste, columnsFor, emptyRow, nextCell, parsePaste, rowProblems } from "./tableAdd.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noSeriousViolations = async (node) => {
  const results = await axe(node);
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
};

const type = { id: "bulbs", axes: [], specRows: [{ key: "watts", label: "Watts", level: "required", input: "text" }, { key: "base", label: "Base", level: "optional", input: "text" }] };

describe("table add rules", () => {
  it("columns are name, price, stock, the required rows and the photo", () => {
    expect(columnsFor(type).map((c) => c.key)).toEqual(["name", "price", "stock", "spec:watts", "photo"]);
    expect(columnsFor(null).map((c) => c.key)).toEqual(["name", "price", "stock", "photo"]);
  });
  it("splits a spreadsheet paste into rows and cells", () => {
    expect(parsePaste("A\t10\t2\r\nB\t20\t\r\n")).toEqual([["A", "10", "2"], ["B", "20", ""]]);
  });
  it("pastes from the chosen cell, adds rows and skips the photo column", () => {
    const cols = columnsFor(type);
    const { rows } = applyPaste([emptyRow()], cols, 0, 0, [["A", "10", "2", "9W", "ignored"], ["B", "20", "", "12W", ""]]);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toEqual({ name: "A", price: "10", stock: "2", "spec:watts": "9W" });
    expect(rows[1].cells.name).toBe("B");
  });
  it("splits problems into ones that block saving and ones that make a draft", () => {
    const cols = columnsFor(type);
    const row = (cells) => ({ ...emptyRow(), cells });
    expect(rowProblems(row({ name: "A" }), type, cols).hard.map((h) => h.key)).toEqual(["name"]);
    expect(rowProblems(row({ name: "LED bulb", price: "x1" }), type, cols).hard.map((h) => h.key)).toEqual(["price"]);
    expect(rowProblems(row({ name: "LED bulb", price: "100" }), type, cols).missing.map((m) => m.key)).toEqual(["spec:watts"]);
    const ok = rowProblems(row({ name: "LED bulb", price: "100", "spec:watts": "9W" }), type, cols);
    expect(ok.hard).toEqual([]);
    expect(ok.missing).toEqual([]);
  });
  it("moves between cells and stops at the edges", () => {
    const size = { rows: 3, cols: 4 };
    expect(nextCell("ArrowDown", { r: 0, c: 1 }, size)).toEqual({ r: 1, c: 1 });
    expect(nextCell("ArrowUp", { r: 0, c: 1 }, size)).toBeNull();
    expect(nextCell("Enter", { r: 2, c: 1 }, size)).toBeNull();
    expect(nextCell("ArrowRight", { r: 1, c: 3 }, size)).toBeNull();
    expect(nextCell("ArrowRight", { r: 1, c: 1 }, size, { start: false, end: false })).toBeNull();
    expect(nextCell("ArrowLeft", { r: 1, c: 1 }, size)).toEqual({ r: 1, c: 0 });
  });
});

const paste = (el, text) => fireEvent.paste(el, { clipboardData: { getData: () => text } });

describe("table add page", () => {
  it("pastes 20 rows, 3 invalid: 17 are added and 3 stay to fix", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add/table");
    const before = M.state.items.length;
    const first = await screen.findByLabelText("Name, row 1");
    const lines = Array.from({ length: 20 }, (_, i) => (i % 7 === 3 ? `X\t${10 + i}\t5` : `Pen ${i + 1}\t${10 + i}\t5`)).join("\n");
    await user.click(first);
    paste(first, lines);
    await screen.findByLabelText("Name, row 20");
    await noSeriousViolations(document.body);
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/17 added, 0 saved as drafts to finish, 3 to fix/), { timeout: 20000 });
    expect(M.state.items.length - before).toBe(17);
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Name must be 2 to 120 characters");
  }, 30000);

  it("moves with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add/table");
    const name1 = await screen.findByLabelText("Name, row 1");
    await user.click(name1);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Name, row 2")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Price (KES), row 2")).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(name1).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Name, row 2")).toHaveFocus();
  });

  it("saves an item with a missing price as a draft", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add/table");
    const before = M.state.items.length;
    await user.type(await screen.findByLabelText("Name, row 1"), "Mystery pen");
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(screen.getByText(/0 added, 1 saved as a draft to finish/)).toBeInTheDocument());
    expect(M.state.items.length - before).toBe(1);
    expect(M.state.items.at(-1).draft).toBe(true);
  });
});
