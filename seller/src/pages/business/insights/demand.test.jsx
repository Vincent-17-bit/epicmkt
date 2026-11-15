import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp } from "../../../test/utils.jsx";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const open = async () => { const v = await signedInApp("/business/demand"); await screen.findByRole("heading", { level: 1, name: "What shoppers want" }); return v; };

describe("demand page", () => {
  it("lists what shoppers looked for, with a suggestion and a link to the item", async () => {
    await open();
    expect(await screen.findByText("12 shoppers looked for Samsung, 512 GB")).toBeInTheDocument();
    expect(screen.getByText("Add 512 GB (Samsung) as an option to Samsung Galaxy S26.")).toBeInTheDocument();
    expect(screen.getByText("3 shoppers looked for Pink")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Add this option/ })[0]).toHaveAttribute("href", "/business/catalog/demo-1/edit");
  });

  it("switches to 30 days and keeps the choice visible in text", async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByText("12 shoppers looked for Samsung, 512 GB");
    await user.click(screen.getByRole("radio", { name: "Last 30 days" }));
    expect(await screen.findByText("19 shoppers looked for Samsung, 512 GB")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Last 30 days" })).toHaveAttribute("aria-checked", "true");
  });

  it("has no serious accessibility violations", async () => {
    const { container } = await open();
    await screen.findByText("12 shoppers looked for Samsung, 512 GB");
    const r = await axe(container);
    expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id)).toEqual([]);
  });
});
