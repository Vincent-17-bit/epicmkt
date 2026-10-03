import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemSpecs from "./ItemSpecs.jsx";

const specs = Array.from({ length: 10 }, (_, i) => ({ label: `Spec ${i + 1}`, value: `Value ${i + 1}` }));

describe("ItemSpecs", () => {
  it("opens Specifications by default and limits to 8 rows", async () => {
    render(<ItemSpecs item={{ specs, description: "Full text", includes: [], terms: "" }} />);
    expect(screen.getByRole("button", { name: "Specifications" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Description" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("term")).toHaveLength(8);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show all specs" }));
    expect(screen.getAllByRole("term")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("term")).toHaveLength(8);
  });

  it("toggles panels independently and shows optional ones only when present", async () => {
    render(<ItemSpecs item={{ specs: [{ label: "A", value: "1" }], description: "Full text", includes: ["Towel"], terms: "No refunds" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Description" }));
    expect(screen.getByText("Full text")).toBeVisible();
    expect(screen.getByRole("button", { name: "Specifications" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "What's included" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terms and notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all specs" })).not.toBeInTheDocument();
  });

  it("hides empty panels and the whole section when nothing exists", () => {
    const { container, rerender } = render(<ItemSpecs item={{ specs: [], description: "Only text", includes: [], terms: "" }} />);
    expect(screen.queryByRole("button", { name: "Specifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What's included" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Description" })).toBeInTheDocument();
    rerender(<ItemSpecs item={{ specs: [], description: "", includes: [], terms: "" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
