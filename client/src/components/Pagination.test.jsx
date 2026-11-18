import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Pagination, { pageItems } from "./Pagination.jsx";

describe("pageItems", () => {
  it("shows every number when they fit", () => {
    expect(pageItems(1, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pageItems(1, 5, { narrow: true })).toEqual([1, 2, 3, 4, 5]);
  });

  it("draws 1 2 3 … last from the start of a long list", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, "gap-20", 20]);
  });

  it("keeps the current page and its neighbours in the middle", () => {
    expect(pageItems(10, 20)).toEqual([1, 2, 3, "gap-9", 9, 10, 11, "gap-20", 20]);
  });

  it("closes a one-number gap with the number, not an ellipsis", () => {
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, "gap-20", 20]);
    expect(pageItems(19, 20)).toEqual([1, 2, 3, "gap-18", 18, 19, 20]);
  });

  it("is shorter on a phone", () => {
    expect(pageItems(1, 20, { narrow: true })).toEqual([1, 2, "gap-20", 20]);
    expect(pageItems(10, 20, { narrow: true })).toEqual([1, "gap-9", 9, 10, 11, "gap-20", 20]);
  });
});

describe("Pagination", () => {
  it("draws nothing for one page", () => {
    const { container } = render(<Pagination page={1} pages={1} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page, disables Previous on the first page, and reports clicks", async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pages={20} onPage={onPage} label="Result pages" />);
    const nav = screen.getByRole("navigation", { name: "Result pages" });
    expect(within(nav).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(within(nav).getByRole("button", { name: "Page 20" }));
    expect(onPage).toHaveBeenLastCalledWith(20);
    await userEvent.click(within(nav).getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });

  it("marks every page on screen and moves Next past the last of them", async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} to={3} pages={8} onPage={onPage} />);
    for (const n of [1, 2, 3]) expect(screen.getByRole("button", { name: `Page ${n}` })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 4" })).not.toHaveAttribute("aria-current");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenLastCalledWith(4);
  });
});
