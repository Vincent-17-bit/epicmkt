import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_CONTACT_EMAIL", "hello@epicmkt.test");
vi.stubEnv("VITE_CONTACT_WHATSAPP", "0712345678");
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => null }));

const { default: Contact } = await import("./Contact.jsx");

const view = (search) =>
  render(
    <MemoryRouter initialEntries={[`/contact${search}`]}>
      <Contact />
    </MemoryRouter>
  );

describe("Contact page", () => {
  it("writes the plans PDF request for the visitor", () => {
    view("?topic=plans");
    expect(screen.getByText(/Ask the EpicMKT admin for the plans PDF/)).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: "hello@epicmkt.test" }).getAttribute("href");
    expect(mail).toContain("subject=Plans%20PDF%20request");
    expect(decodeURIComponent(mail)).toContain("please send me the plans PDF");
    const wa = screen.getByRole("link", { name: "Chat on WhatsApp" }).getAttribute("href");
    expect(decodeURIComponent(wa)).toContain("please send me the plans PDF");
  });

  it("ignores unknown topics, including object property names", () => {
    view("?topic=constructor");
    expect(screen.queryByText(/plans PDF/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hello@epicmkt.test" })).toHaveAttribute("href", "mailto:hello@epicmkt.test");
  });

  it("keeps the listing suggestion message working", () => {
    view("?suggest=Maseno%20Gym");
    const mail = screen.getByRole("link", { name: "hello@epicmkt.test" }).getAttribute("href");
    expect(mail).toContain("subject=Listing%20suggestion");
    expect(decodeURIComponent(mail)).toContain('Please add "Maseno Gym" to EpicMKT.');
  });
});
