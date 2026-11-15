import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addAxis, addValue, emptyOptionsForm, fillDownPrices, pastePrices } from "@epicmkt/shared";
import PriceTools from "./PriceTools.jsx";

// Colour (Black, Grey) x Storage (128 GB, 256 GB): four combinations, no prices yet.
const build = () => {
  let o = addAxis(emptyOptionsForm(), { label: "Colour", display: "swatch" });
  for (const v of ["Black", "Grey"]) o = addValue(o, "colour", v).options;
  o = addAxis(o, { label: "Storage", display: "button" });
  for (const v of ["128 GB", "256 GB"]) o = addValue(o, "storage", v).options;
  return o;
};
const prices = (o) => o.rows.map((r) => r.price);

describe("paste prices from a spreadsheet (B09)", () => {
  it("reads a grid: one option across the top, another down the side, with thousands separators", () => {
    const r = pastePrices(build(), "\tBlack\tGrey\n128 GB\t22,000\t21000\n256 GB\t25000\t24000");
    expect(r.filled).toBe(4);
    expect(r.skipped).toBe(0);
    expect(prices(r.options)).toEqual(["22000", "25000", "21000", "24000"]);
  });

  it("reads a two-column list and skips names it does not know", () => {
    const r = pastePrices(build(), "Black\t25000\nGrey\tKES 24,000\nPurple\t1");
    expect(prices(r.options)).toEqual(["25000", "25000", "24000", "24000"]);
    expect(r.skipped).toBe(1);
  });

  it("leaves everything as it was for text that is not prices", () => {
    const o = build();
    const r = pastePrices(o, "hello\nworld");
    expect(r.filled).toBe(0);
    expect(prices(r.options)).toEqual(prices(o));
  });
});

describe("fill down", () => {
  it("copies the price above into empty rows and keeps the rows that have one", () => {
    const o = build();
    const start = { ...o, rows: o.rows.map((r, i) => (i === 0 ? { ...r, price: "100" } : i === 2 ? { ...r, price: "90" } : r)) };
    const r = fillDownPrices(start);
    expect(r.filled).toBe(2);
    expect(prices(r.options)).toEqual(["100", "100", "90", "90"]);
  });
});

describe("the price tools panel", () => {
  it("pastes, fills down and undoes the last bulk change", async () => {
    let options = build();
    const set = vi.fn((next) => (options = next));
    const announce = vi.fn();
    const { rerender } = render(<PriceTools options={options} set={set} announce={announce} />);
    await userEvent.click(screen.getByText("Fill prices faster"));

    const box = screen.getByLabelText("Paste from a spreadsheet");
    fireEvent.paste(box, { clipboardData: { getData: () => "Black\t25000\nGrey\t24000" } });
    expect(prices(options)).toEqual(["25000", "25000", "24000", "24000"]);
    expect(announce).toHaveBeenLastCalledWith("4 prices filled from the paste.");

    rerender(<PriceTools options={options} set={set} announce={announce} />);
    const undo = screen.getByRole("button", { name: "Undo last change" });
    expect(undo).toBeEnabled();
    await userEvent.click(undo);
    expect(prices(options)).toEqual(["", "", "", ""]);
    expect(announce).toHaveBeenLastCalledWith("Last change undone.");
    rerender(<PriceTools options={options} set={set} announce={announce} />);
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();

    options = { ...options, rows: options.rows.map((r, i) => (i === 0 ? { ...r, price: "500" } : r)) };
    rerender(<PriceTools options={options} set={set} announce={announce} />);
    await userEvent.click(screen.getByRole("button", { name: "Fill down empty prices" }));
    expect(prices(options)).toEqual(["500", "500", "500", "500"]);
  });
});
