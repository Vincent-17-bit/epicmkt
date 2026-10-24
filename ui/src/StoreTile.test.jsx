import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StoreTile } from "./index.js";
import { business } from "./test/fixtures.js";

const priced = { ...business, fromPriceKes: 150 };

describe("StoreTile", () => {
  it("shows name, category and town, open status and the starting price, but not tagline or rating", () => {
    render(<StoreTile business={priced} href="/b/fade-kings" />);
    expect(screen.getByRole("heading", { name: /Fade Kings/ })).toBeInTheDocument();
    expect(screen.getByText("Barbershops · Maseno")).toBeInTheDocument();
    expect(screen.getByText(/KSh\s?150/)).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText("Sharp cuts")).not.toBeInTheDocument();
    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
  });

  it("opens the store from the name and keeps the contact buttons outside that link", () => {
    render(<StoreTile business={priced} href="/b/fade-kings" />);
    expect(screen.getByRole("link", { name: "Fade Kings" })).toHaveAttribute("href", "/b/fade-kings");
    const call = screen.getByRole("link", { name: "Call Fade Kings" });
    expect(call.closest("h3")).toBeNull();
    expect(screen.getByRole("link", { name: "WhatsApp Fade Kings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Directions to Fade Kings" })).toBeInTheDocument();
  });

  it("tracks contacts", () => {
    const onContact = vi.fn();
    render(<StoreTile business={priced} href="/b/fade-kings" onContact={onContact} />);
    fireEvent.click(screen.getByRole("link", { name: "Call Fade Kings" }));
    expect(onContact).toHaveBeenCalledWith(priced, "call");
  });

  it("marks a featured and a verified store with the same icons the product tiles use", () => {
    render(<StoreTile business={priced} href="/x" />);
    expect(screen.getByText(/Featured store/)).toBeInTheDocument();
    expect(screen.getByText("Verified store")).toBeInTheDocument();
  });

  it("shows neither mark for an ordinary store and Closed when closed", () => {
    render(<StoreTile business={{ ...priced, plan: "standard", verified: false, isOpen: false }} href="/x" />);
    expect(screen.queryByText(/Featured store/)).not.toBeInTheDocument();
    expect(screen.queryByText("Verified store")).not.toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("still makes a complete card for a brand-new business with no cover, logo, price or contact details", () => {
    const fresh = { id: "n1", slug: "new-shop", name: "Brand New Shop With A Really Quite Long Name", plan: "standard", verified: false, isOpen: true, categoryName: "Bakery", area: "Kisumu" };
    const { container } = render(<StoreTile business={fresh} href="/b/new-shop" />);
    expect(screen.getByRole("link", { name: /Brand New Shop/ })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(/KSh/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("falls back to the logo when the cover is missing", () => {
    const { container } = render(<StoreTile business={{ ...priced, coverUrl: null, logoUrl: "/logo.png" }} href="/x" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/logo.png");
  });

  it("falls back when the cover fails to load", () => {
    const { container } = render(<StoreTile business={{ ...priced, coverUrl: "/broken.jpg" }} href="/x" />);
    fireEvent.error(container.querySelector("img"));
    expect(container.querySelector("img")).toBeNull();
  });
});
