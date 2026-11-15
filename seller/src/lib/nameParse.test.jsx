import { describe, expect, it } from "vitest";
import { nameChips, parseName } from "./nameParse.js";

describe("parseName on real names", () => {
  it.each([
    ["Samsung Galaxy A15 128GB", [["storage", "128 GB"]]],
    ["iPhone 13 256 GB Blue", [["storage", "256 GB"]]],
    ["Philips LED bulb 9W E27", [["power", "9 W"], ["base", "E27"]]],
    ["Osram LED 12w GU10 warm", [["power", "12 W"], ["base", "GU10"]]],
    ["Double A Paper A4 500 sheets", [["paper", "A4"]]],
    ["Jerrycan 20L", [["volume", "20 L"]]],
    ["Cooking oil 500ml", [["volume", "500 ml"]]],
    ["Kingston flash disk 1TB", [["storage", "1 TB"]]],
    ["Men's fade cut", []],
    ["Chocolate cake, 1 kg", []]
  ])("%s", (name, want) => expect(parseName(name).map((c) => [c.kind, c.text])).toEqual(want));

  it("does not mistake letters inside words for sizes", () => {
    expect(parseName("Bag Aa4 5W")).toEqual([{ kind: "power", text: "5 W" }]);
  });
});

describe("nameChips", () => {
  const rows = [{ key: "wattage", label: "Wattage" }, { key: "base", label: "Base", input: "choice", choices: ["E27", "E14", "B22"] }, { key: "brand", label: "Brand" }];
  it("lands each chip in the row it belongs to", () => {
    const chips = nameChips("Philips LED bulb 9W E27", rows);
    expect(chips.map((c) => [c.row.key, c.value])).toEqual([["wattage", "9 W"], ["base", "E27"]]);
  });
  it("skips rows that already have an answer and values outside a row's list", () => {
    expect(nameChips("LED 9W E27", rows, (r) => r.key === "wattage").map((c) => c.row.key)).toEqual(["base"]);
    expect(nameChips("LED GU10", rows)).toEqual([]);
  });
  it("shows nothing without a type", () => expect(nameChips("LED 9W", [])).toEqual([]));
});
