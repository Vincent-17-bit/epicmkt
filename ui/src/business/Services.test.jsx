import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Services from "./Services.jsx";

const svc = (id, name, over = {}) => ({ id, name, priceKes: 100, section: "Cuts", availability: "available", imageUrl: null, ...over });

const view = (services) => {
  render(<Services services={services} />);
  return within(screen.getByRole("region", { name: /^All products/ }));
};

describe("Services on the store page", () => {
  it("lists available items with no availability marker at all", () => {
    const list = view([svc("a", "Fade cut"), svc("b", "Beard trim", { availability: "by_appointment" })]);
    expect(list.getByText("Fade cut")).toBeInTheDocument();
    expect(list.getByText("Beard trim")).toBeInTheDocument();
    expect(document.querySelector("[data-stock-tag]")).toBeNull();
  });

  it("tags an item that is running low", () => {
    const list = view([svc("a", "Fade cut"), svc("b", "Shampoo", { availability: "limited_stock", stockLeft: 2 })]);
    expect(list.getByText("Only 2 left")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-stock-tag]")).toHaveLength(1);
  });

  it("does not list a sold-out item, under either word for it", () => {
    const list = view([svc("a", "Fade cut"), svc("b", "Gone", { availability: "out_of_stock" }), svc("c", "Old gone", { availability: "unavailable" })]);
    expect(list.getByText("Fade cut")).toBeInTheDocument();
    expect(list.queryByText("Gone")).not.toBeInTheDocument();
    expect(list.queryByText("Old gone")).not.toBeInTheDocument();
  });

  it("pages 24 at a time and keeps the order stable", () => {
    const many = Array.from({ length: 60 }, (_, i) => svc(`s${i}`, `Item ${i}`, { section: i < 30 ? "A" : "B" }));
    const list = view(many);
    expect(list.getAllByRole("button", { name: /Item/ })).toHaveLength(24);
    fireEvent.click(list.getByRole("button", { name: "Show more" }));
    expect(list.getAllByRole("button", { name: /Item/ })).toHaveLength(48);
    fireEvent.click(list.getByRole("button", { name: "Show more" }));
    expect(list.getAllByRole("button", { name: /Item/ })).toHaveLength(60);
    expect(list.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("loads enough items to include a section or item deep link", () => {
    const many = Array.from({ length: 60 }, (_, i) => svc(`s${i}`, `Item ${i}`, { section: i < 30 ? "A" : "B" }));
    render(<Services services={many} focusSection="b" />);
    expect(document.getElementById("section-b")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /Item/ })).toHaveLength(48);
  });

  it("uses the given count in the heading and falls back to the listed length", () => {
    render(<Services services={[svc("a", "One"), svc("b", "Two")]} count={195} />);
    expect(screen.getByRole("region", { name: "All products (195)" })).toBeInTheDocument();
  });

  it("searches after a short pause and clears", async () => {
    const list = view([svc("a", "Fade cut"), svc("b", "Beard trim", { brand: "Acme" }), svc("c", "Shampoo")]);
    expect(list.getByRole("button", { name: /Fade/ })).toBeInTheDocument();
    fireEvent.change(list.getByPlaceholderText("Search this store"), { target: { value: "acme" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(list.getByText("Showing 1 of 3")).toBeInTheDocument();
    expect(list.queryByText("Fade cut")).not.toBeInTheDocument();
    fireEvent.click(list.getByRole("button", { name: "Clear" }));
    expect(list.getByText("Fade cut")).toBeInTheDocument();
    expect(list.queryByText(/Showing/)).toBeNull();
  });

  it("shows no search or paging for a one item store", () => {
    const list = view([svc("a", "Only one")]);
    expect(list.queryByPlaceholderText("Search this store")).toBeNull();
    expect(list.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(list.getByRole("button", { name: /Only one/ })).toBeInTheDocument();
  });

  it("says so when a store has no products, with no search or paging", () => {
    render(<Services services={[]} />);
    const region = within(screen.getByRole("region", { name: "All products (0)" }));
    expect(region.getByText("No products listed yet.")).toBeInTheDocument();
    expect(region.queryByPlaceholderText("Search this store")).toBeNull();
    expect(region.queryByText(/Nothing matches/)).toBeNull();
  });
});
