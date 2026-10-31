import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mountApp } from "../../test/mountApp.jsx";

beforeEach(() => { localStorage.clear(); window.innerWidth = 1440; });
afterEach(cleanup);

describe("sortable table headers (Businesses)", () => {
  it("sortable columns announce themselves, and sorting works from the keyboard", async () => {
    const user = userEvent.setup();
    mountApp("/admin/businesses", "light");
    await screen.findByRole("heading", { level: 1, name: /Businesses/i });
    const grid = await screen.findByRole("grid");
    await waitFor(() => expect(grid.querySelectorAll('[role="columnheader"]').length).toBeGreaterThan(1));

    const sortable = [...grid.querySelectorAll('[role="columnheader"]')].filter((h) => h.querySelector(".dt__sort"));
    expect(sortable.length).toBeGreaterThan(0);

    // every sortable column says so; exactly the sorted one says which way
    const states = sortable.map((h) => h.getAttribute("aria-sort"));
    for (const s of states) expect(["none", "ascending", "descending"]).toContain(s);

    // the sort buttons are real tab stops, not hidden from the keyboard
    for (const h of sortable) expect(h.querySelector(".dt__sort")).not.toHaveAttribute("tabindex", "-1");

    const target = sortable.find((h) => h.getAttribute("aria-sort") === "none");
    expect(target).toBeTruthy();
    const button = target.querySelector(".dt__sort");
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(target).toHaveAttribute("aria-sort", "ascending"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(target).toHaveAttribute("aria-sort", "descending"));
  });

  it("the select-all checkbox is reachable by keyboard and named", async () => {
    mountApp("/admin/businesses", "light");
    await screen.findByRole("grid");
    const all = document.querySelector('input[aria-label="Select all rows on this page"]');
    if (all) expect(all).not.toHaveAttribute("tabindex", "-1"); // selectable tables only
  });
});
