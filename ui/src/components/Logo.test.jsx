import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo, { LogoMark } from "./Logo.jsx";

describe("Logo", () => {
  it("shows the name as real text and hides the picture from screen readers", () => {
    const { container } = render(<Logo />);
    expect(screen.getByText("EpicMKT")).toBeInTheDocument();
    expect(container.querySelector("img").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a tagline only when given one", () => {
    const { rerender } = render(<Logo />);
    expect(screen.queryByText("Digitize. Scale. Thrive.")).toBeNull();
    rerender(<Logo tagline="Digitize. Scale. Thrive." />);
    expect(screen.getByText("Digitize. Scale. Thrive.")).toBeInTheDocument();
  });

  it("sizes the mark", () => {
    const { container } = render(<LogoMark size={48} />);
    expect(container.querySelector("img").getAttribute("width")).toBe("48");
  });
});
