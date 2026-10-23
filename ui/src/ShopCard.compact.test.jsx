import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShopCard } from "./index.js";
import { business } from "./test/fixtures.js";

const priced = { ...business, fromPriceKes: 150 };

describe("ShopCard compact", () => {
  it("drops tagline, highlights and rating but keeps name, place, price and status", () => {
    render(<ShopCard business={{ ...priced, highlights: ["Fades"] }} href="/b/fade-kings" compact />);
    expect(screen.getByRole("heading", { name: "Fade Kings" })).toBeInTheDocument();
    expect(screen.getByText("Barbershops · Maseno")).toBeInTheDocument();
    expect(screen.getByText(/KES\s?150/)).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText("Sharp cuts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Highlights")).not.toBeInTheDocument();
    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
  });

  it("gives every icon-sized action an accessible name and still tracks contacts", () => {
    const onContact = vi.fn();
    render(<ShopCard business={priced} href="/b/fade-kings" onContact={onContact} compact />);
    expect(screen.getByRole("link", { name: "WhatsApp Fade Kings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Directions to Fade Kings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Call Fade Kings" }));
    expect(onContact).toHaveBeenCalledWith(priced, "call");
  });

  it("shows Closed when the business is closed", () => {
    render(<ShopCard business={{ ...priced, isOpen: false }} href="/b/x" compact />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("leaves the default card unchanged", () => {
    render(<ShopCard business={priced} href="/b/fade-kings" />);
    expect(screen.getByText("Sharp cuts")).toBeInTheDocument();
    expect(screen.getByText("Open now")).toBeInTheDocument();
    expect(screen.getByText("Directions")).toBeInTheDocument();
  });
});
