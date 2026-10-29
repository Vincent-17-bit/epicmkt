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
  it("shows the plans PDF message before it is sent, with WhatsApp first", () => {
    view("?topic=plans");
    expect(screen.getByRole("heading", { level: 1, name: "Get the plans PDF" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your message is ready" })).toBeInTheDocument();
    const message = "Hello EpicMKT support, I need to get the PDF for pricing on the listings.";
    expect(screen.getByText(message)).toBeInTheDocument();
    const links = screen.getAllByRole("link").filter((l) => /Send on WhatsApp|Send by email/.test(l.textContent));
    expect(links.map((l) => l.textContent)).toEqual(["Send on WhatsApp", "Send by email"]);
  });

  it("sends that same message on WhatsApp and by email", () => {
    view("?topic=plans");
    const message = "Hello EpicMKT support, I need to get the PDF for pricing on the listings.";
    const wa = screen.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href");
    expect(wa).toContain("wa.me/");
    expect(decodeURIComponent(wa)).toContain(message);
    const mail = screen.getByRole("link", { name: "Send by email" }).getAttribute("href");
    expect(mail).toContain("subject=Pricing%20PDF%20request");
    expect(decodeURIComponent(mail)).toContain(message);
  });

  it("ignores unknown topics, including object property names", () => {
    view("?topic=constructor");
    expect(screen.queryByText("Your message is ready")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hello@epicmkt.test" })).toHaveAttribute("href", "mailto:hello@epicmkt.test");
  });

  it("keeps the listing suggestion message working", () => {
    view("?suggest=Maseno%20Gym");
    const mail = screen.getByRole("link", { name: "hello@epicmkt.test" }).getAttribute("href");
    expect(mail).toContain("subject=Listing%20suggestion");
    expect(decodeURIComponent(mail)).toContain('Please add "Maseno Gym" to EpicMKT.');
  });
});
