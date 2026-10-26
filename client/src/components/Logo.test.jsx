import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo, { LogoMark } from "./Logo.jsx";

describe("Logo", () => {
  it("shows the name as real text and hides the drawing from screen readers", () => {
    const { container } = render(<Logo />);
    expect(screen.getByText("EpicMKT")).toBeInTheDocument();
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a tagline only when given one", () => {
    const { rerender } = render(<Logo />);
    expect(screen.queryByText("Everything local. One tap away.")).toBeNull();
    rerender(<Logo tagline="Everything local. One tap away." />);
    expect(screen.getByText("Everything local. One tap away.")).toBeInTheDocument();
  });

  it("uses no ids, so the header and footer can both draw it on one page", () => {
    const { container } = render(<LogoMark />);
    expect(container.querySelector("[id]")).toBeNull();
  });
});
