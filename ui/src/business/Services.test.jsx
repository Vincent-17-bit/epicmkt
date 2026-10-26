import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Services from "./Services.jsx";

const svc = (id, name, over = {}) => ({ id, name, priceKes: 100, section: "Cuts", availability: "available", imageUrl: null, ...over });

const view = (services) => {
  render(<Services services={services} />);
  return within(screen.getByRole("region", { name: "Services and prices" }));
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
});
