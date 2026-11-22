import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PAGE, layoutCatalogue, rowsPerPage } from "./cataloguePdf.js";

const items = (n, prefix = "i") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Item ${i}` }));
const cards = (cells) => cells.filter((c) => c.kind === "card");

describe("layoutCatalogue", () => {
  it("puts three cards in a row and fills a page before starting the next", () => {
    const rows = rowsPerPage(true);
    const per = rows * 3;
    const { cells, pages } = layoutCatalogue([{ title: "", items: items(per + 1) }]);
    assert.equal(pages, 2);
    assert.equal(cards(cells).filter((c) => c.page === 0).length, per);
    assert.equal(cards(cells).filter((c) => c.page === 1).length, 1);
    assert.equal(new Set(cards(cells).slice(0, 3).map((c) => c.y)).size, 1);
    assert.equal(new Set(cards(cells).slice(0, 3).map((c) => c.x)).size, 3);
  });

  it("fits more rows when there are no prices", () => {
    assert.ok(rowsPerPage(false) >= rowsPerPage(true));
  });

  it("keeps every card inside the page margins", () => {
    const { cells } = layoutCatalogue([{ title: "A", items: items(40) }, { title: "B", items: items(7, "b") }]);
    for (const c of cards(cells)) {
      assert.ok(c.x >= PAGE.margin);
      assert.ok(c.x < PAGE.w - PAGE.margin);
      assert.ok(c.y >= 22);
    }
  });

  it("starts a section on a new row, with its heading above its first card", () => {
    const { cells } = layoutCatalogue([{ title: "Bakery", items: items(2) }, { title: "Drinks", items: items(2, "d") }]);
    const drinksHeading = cells.find((c) => c.title === "Drinks");
    const firstDrink = cards(cells).find((c) => c.item.id === "d0");
    assert.ok(firstDrink.y > drinksHeading.y);
    assert.ok(firstDrink.y > cards(cells)[0].y);
    assert.equal(firstDrink.x, PAGE.margin);
  });

  it("never leaves a heading alone at the bottom of a page", () => {
    const rows = rowsPerPage(true);
    const { cells } = layoutCatalogue([{ title: "A", items: items(rows * 3 - 1) }, { title: "B", items: items(1, "b") }]);
    const heading = cells.find((c) => c.title === "B");
    const card = cards(cells).find((c) => c.item.id === "b0");
    assert.equal(heading.page, card.page);
  });

  it("repeats the section name when it continues on the next page", () => {
    const rows = rowsPerPage(true);
    const { cells } = layoutCatalogue([{ title: "Big", items: items(rows * 3 + 2) }]);
    assert.equal(cells.some((c) => c.title === "Big (continued)" && c.page === 1), true);
  });

  it("handles no items", () => {
    assert.deepEqual(layoutCatalogue([]), { cells: [], pages: 1 });
  });
});
