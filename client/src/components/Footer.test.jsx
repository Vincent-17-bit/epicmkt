import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Footer from "./Footer.jsx";

describe("Footer", () => {
  it("gives each business link its own page", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    const group = screen.getByRole("heading", { name: "For businesses" }).closest("section");
    expect(within(group).getByRole("link", { name: "Become a seller" })).toHaveAttribute("href", "/become-a-seller");
    expect(within(group).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(group).getByRole("link", { name: "Seller guide" })).toHaveAttribute("href", "/seller-guide");
  });

  it("gives each Help link its own page", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    const group = screen.getByRole("heading", { name: "Help" }).closest("section");
    expect(within(group).getAllByRole("link")).toHaveLength(4);
    expect(within(group).getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "/faq");
    expect(within(group).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
    expect(within(group).getByRole("link", { name: "Report a problem" })).toHaveAttribute("href", "/report-a-problem");
    expect(within(group).getByRole("link", { name: "Suggest a business" })).toHaveAttribute("href", "/suggest-a-business");
  });
});
