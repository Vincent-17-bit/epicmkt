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
});
