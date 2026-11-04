import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Accordion from "./Accordion.jsx";

describe("Accordion", () => {
  it("shows a plain-text answer in a paragraph", () => {
    render(<Accordion items={[{ q: "Is it free?", a: "Yes." }]} idPrefix="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Is it free?" }));
    expect(screen.getByText("Yes.").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "Is it free?" })).toHaveAttribute("aria-expanded", "true");
  });

  it("accepts a node as the answer, so an answer can carry a link", () => {
    render(<Accordion items={[{ q: "Where?", a: <>Read the <a href="/guide">guide</a>.</> }]} idPrefix="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Where?" }));
    expect(screen.getByRole("link", { name: "guide" })).toHaveAttribute("href", "/guide");
  });
});
