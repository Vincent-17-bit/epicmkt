import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFixture } from "@epicmkt/shared";
import { seriousViolations } from "../../test/axe.js";
import Tiers from "./Tiers.jsx";
import { withTiers } from "../../api/flash/tiers.js";

const T = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }];
const item = (mode) => ({ id: "p", unit: "page", priceTiers: T, priceTierMode: mode });
const type = async (user, n) => { const q = screen.getByRole("spinbutton"); await user.clear(q); await user.type(q, String(n)); };
const total = () => screen.getByTestId("tiers-total");
const currentRow = () => screen.getAllByRole("row").find((r) => r.getAttribute("aria-current") === "true");

describe("tier price table", () => {
  it("shows the tiers and starts at one", () => {
    render(<Tiers item={item("whole")} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => [...r.children].map((c) => c.textContent.trim()))).toEqual([["1 to 10 Your quantity", "KES 10 each"], ["11 to 100", "KES 7 each"], ["101 or more", "KES 5 each"]]);
    expect(total()).toHaveTextContent("1 page = KES 10");
    expect(screen.getByTestId("tiers-next")).toHaveTextContent("Add 10 more for KES 7 each");
  });

  it("whole mode: the whole order takes the price of the tier it reaches (10, 11, 100, 101)", async () => {
    const user = userEvent.setup();
    render(<Tiers item={item("whole")} />);
    const expected = { 10: ["KES 100", "1 to 10"], 11: ["KES 77", "11 to 100"], 100: ["KES 700", "11 to 100"], 101: ["KES 505", "101 or more"] };
    for (const [n, [sum, row]] of Object.entries(expected)) {
      await type(user, n);
      expect(total()).toHaveTextContent(`${n} pages = ${sum}`);
      expect(currentRow()).toHaveTextContent(row);
    }
    expect(screen.queryByTestId("tiers-next")).not.toBeInTheDocument();
  });

  it("graduated mode: each unit takes the price of its own band, with the breakdown", async () => {
    const user = userEvent.setup();
    render(<Tiers item={item("graduated")} />);
    await type(user, 11);
    expect(total()).toHaveTextContent("11 pages = KES 107");
    expect(total()).toHaveTextContent("10 × KES 10 + 1 × KES 7");
    await type(user, 101);
    expect(total()).toHaveTextContent("101 pages = KES 735");
    expect(screen.getByText(/priced by the tier it falls in/)).toBeInTheDocument();
  });

  it("the hint counts down to the next tier and the buttons step by one", async () => {
    const user = userEvent.setup();
    render(<Tiers item={item("whole")} />);
    await type(user, 8);
    expect(screen.getByTestId("tiers-next")).toHaveTextContent("Add 3 more for KES 7 each");
    await user.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(9);
    await type(user, 1);
    expect(screen.getByRole("button", { name: "One less" })).toBeDisabled();
  });

  it("a combination's own tiers win over the item's (printing fixture, A3)", () => {
    const d = getFixture("fx-printing").detail;
    const a3 = d.optionVariants.find((v) => v.choice.paper === "a3");
    render(<Tiers item={d} variant={a3} />);
    expect(screen.getAllByRole("row").map((r) => r.textContent).join(" ")).toMatch(/KES 40 each/);
  });

  it("renders nothing without valid tiers", () => {
    const { container } = render(<Tiers item={{ priceTiers: [{ minQty: 2, maxQty: null, unitPrice: 5 }] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = render(<Tiers item={item("graduated")} />);
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe("tiers from the live read", () => {
  it("puts the item's tiers and each combination's own tiers on the detail", () => {
    const detail = { id: "x", optionVariants: [{ id: "v1", choice: { paper: "a4" } }, { id: "v2", choice: { paper: "a3" } }] };
    const out = withTiers(detail, { tiers: T, mode: "graduated", variants: [{ choice: { paper: "a3" }, tiers: [{ minQty: 1, maxQty: null, unitPrice: 40 }] }] });
    expect(out.priceTiers).toEqual(T);
    expect(out.priceTierMode).toBe("graduated");
    expect(out.optionVariants[0].priceTiers).toBeUndefined();
    expect(out.optionVariants[1].priceTiers[0].unitPrice).toBe(40);
  });
  it("leaves the detail alone when there are none", () => {
    const detail = { id: "x" };
    expect(withTiers(detail, null)).toBe(detail);
    expect(withTiers(detail, { tiers: null, mode: "whole", variants: [] })).toEqual(detail);
  });
});
