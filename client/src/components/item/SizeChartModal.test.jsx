import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SizeChartLink from "./SizeChartModal.jsx";
import { seriousViolations } from "../../test/axe.js";

const chart = { id: "c1", name: "Dresses and tops", unit: "cm", overridden: false, columns: ["Size", "Bust (cm)", "Waist (cm)"], rows: [["S", "86-90", "66"], ["M", "91-95", "71"]] };
const mount = (props = {}) => render(<SizeChartLink chart={chart} selected="M" {...props} />);
const dialog = () => document.querySelector("dialog");

describe("size chart modal", () => {
  it("shows no link when the item has no chart", () => {
    const { container } = render(<SizeChartLink chart={null} />);
    expect(container).toBeEmptyDOMElement();
    const empty = render(<SizeChartLink chart={{ ...chart, rows: [] }} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("opens from the link with the chart, the unit switch and the selected row marked", async () => {
    mount();
    expect(dialog()).not.toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Dresses and tops" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Bust (cm)" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveAttribute("aria-current", "true");
    expect(within(rows[2]).getByRole("rowheader")).toHaveTextContent("M (Selected size)");
  });

  it("switches cm and in, ranges included, and by arrow keys", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.getByRole("radio", { name: "cm" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "in" }));
    expect(screen.getByRole("columnheader", { name: "Bust (in)" })).toBeInTheDocument();
    expect(screen.getByText("33.9-35.4")).toBeInTheDocument();
    screen.getByRole("radio", { name: "in" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "cm" })).toBeChecked();
  });

  it("has no unit switch when nothing is measured", async () => {
    mount({ chart: { ...chart, unit: "age", columns: ["Age", "Height"], rows: [["3-4", "Tall"]] } });
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("closes with the Close button and Esc, and focus returns to the link", async () => {
    mount();
    const link = screen.getByRole("button", { name: "Size chart" });
    await userEvent.click(link);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).not.toHaveAttribute("open");
    expect(link).toHaveFocus();

    await userEvent.click(link);
    expect(dialog()).toHaveAttribute("open");
    fireEvent(dialog(), new Event("close")); // what the browser fires on Esc
    expect(dialog()).not.toHaveAttribute("open");
    expect(link).toHaveFocus();
  });

  it("closes on a click outside (the backdrop), not on a click inside", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    await userEvent.click(screen.getByRole("heading", { name: "Dresses and tops" }));
    expect(dialog()).toHaveAttribute("open");
    fireEvent.click(dialog());
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("locks the page scroll while open and releases it after", async () => {
    mount();
    expect(document.body.style.overflow).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("notes an item-level override", async () => {
    mount({ chart: { ...chart, overridden: true } });
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.getByText(/adjusted this chart/)).toBeInTheDocument();
  });

  it("has no serious accessibility violations (closed and open)", async () => {
    const { container } = mount();
    expect(await seriousViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});

describe("size guide with photos", () => {
  const bread = { id: "b", name: "Size guide", unit: "g", columns: ["Size", "Weight (g)", "Slices", "Serves (people)"], rows: [["Standard", "400g", "16", "4-6"], ["medium", "700g", "–", "–"], ["large", "900g", "–", "–"]] };
  const photoFor = (row) => (row[1] === "700g" ? "p700.png" : null);

  it("shows the chosen size's photo and only the details it has", async () => {
    render(<SizeChartLink chart={bread} selected="400g" photoFor={photoFor} />);
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.getByRole("button", { name: /Standard/ })).toHaveAttribute("aria-pressed", "true");   // the buyer's own size, found by its weight
    await userEvent.click(screen.getByRole("button", { name: /^Medium/ }));
    const detail = screen.getByRole("region", { name: "Medium" });
    expect(within(detail).getByRole("img", { name: "Medium" })).toHaveAttribute("src", "p700.png");
    expect(within(detail).getByText("700g")).toBeInTheDocument();
    expect(within(detail).queryByText("Slices")).toBeNull();   // empty cells are left out
  });

  it("lets the buyer choose the size from the guide", async () => {
    const onPick = vi.fn();
    render(<SizeChartLink chart={bread} selected="400g" onPick={onPick} pickable={() => true} />);
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.queryByRole("button", { name: /^Choose/ })).toBeNull();   // already the selected size
    await userEvent.click(screen.getByRole("button", { name: /^Large/ }));
    await userEvent.click(screen.getByRole("button", { name: "Choose Large" }));
    expect(onPick).toHaveBeenCalledWith(["large", "900g", "–", "–"]);
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });
});
