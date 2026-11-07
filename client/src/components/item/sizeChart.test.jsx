import { describe, expect, it } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SEED_SIZE_CHARTS } from "@epicmkt/shared";
import { seriousViolations } from "../../test/axe.js";
import SizeChartLink from "./SizeChartLink.jsx";

const dress = { id: "c1", ...SEED_SIZE_CHARTS[0], overridden: false };
const mount = (chart = dress) => render(<SizeChartLink chart={chart} />);
const dialog = () => document.querySelector("dialog");

describe("size chart link and modal", () => {
  it("is hidden when the item has no chart or the chart has no rows", () => {
    const a = mount(null);
    expect(a.container).toBeEmptyDOMElement();
    const b = mount({ ...dress, rows: [] });
    expect(b.container).toBeEmptyDOMElement();
  });

  it("opens with the chart, a labelled dialog and a row header per size", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveAccessibleName("Size chart");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "XS" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Bust" })).toBeInTheDocument();
  });

  it("toggles cm and in and says which is on", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    const cm = screen.getByRole("button", { name: "cm" });
    const inch = screen.getByRole("button", { name: "in" });
    expect(cm).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(inch);
    expect(inch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("cell", { name: "31.5" })).toBeInTheDocument(); // XS bust 80 cm
  });

  it("closes with the Close button and puts focus back on the link", async () => {
    mount();
    const link = screen.getByRole("button", { name: "Size chart" });
    await userEvent.click(link);
    await userEvent.click(screen.getByRole("button", { name: "Close size chart" }));
    expect(dialog()).not.toHaveAttribute("open");
    expect(link).toHaveFocus();
  });

  it("closes on a click outside the sheet (the backdrop)", async () => {
    mount();
    const link = screen.getByRole("button", { name: "Size chart" });
    await userEvent.click(link);
    fireEvent.click(dialog()); // target is the dialog itself = the backdrop
    expect(dialog()).not.toHaveAttribute("open");
    expect(link).toHaveFocus();
  });

  it("does not close when the click is inside the sheet", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    await userEvent.click(screen.getByRole("table"));
    expect(dialog()).toHaveAttribute("open");
  });

  it("closes on Escape (the dialog's cancel event) and returns focus", async () => {
    mount();
    const link = screen.getByRole("button", { name: "Size chart" });
    await userEvent.click(link);
    // A native dialog turns Esc into cancel, then close; jsdom has neither, so send close the way the browser does.
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    act(() => dialog().close());
    expect(link).toHaveFocus();
  });

  it("locks the page scroll while open and restores it after", async () => {
    document.body.style.overflow = "auto";
    mount();
    const link = screen.getByRole("button", { name: "Size chart" });
    await userEvent.click(link);
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: "Close size chart" }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("marks the seller's own measurements", async () => {
    mount({ ...dress, overridden: true });
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(screen.getByText("Seller's own measurements")).toBeInTheDocument();
  });

  it("has no serious accessibility violations, closed or open", async () => {
    const { container } = mount();
    expect(await seriousViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
