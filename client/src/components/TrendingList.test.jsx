import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import TrendingList from "./TrendingList.jsx";

const items = [
  { term: "gas", label: "Gas 6kg", kind: "product", count: 1200 },
  { term: "bakery", kind: "store", count: 1 },
  { term: "barber", kind: "category", count: 0 }
];

describe("TrendingList", () => {
  it("marks only the first row as top trending with the fire icon", () => {
    render(<TrendingList items={items} onPick={() => {}} />);
    expect(screen.getAllByText("Top trending")).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "Trending now" })).toHaveLength(1);
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Gas 6kg");
  });

  it("does not show how many searches were done", () => {
    render(<TrendingList items={items} onPick={() => {}} />);
    expect(screen.queryByText(/searches?$/)).toBeNull();
  });

  it("calls onPick with the row, and renders links when hrefFor is given", async () => {
    const onPick = vi.fn();
    render(
      <MemoryRouter>
        <TrendingList items={items} hrefFor={(i) => `/products?q=${i.term}`} onPick={onPick} />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("link", { name: /bakery/ }));
    expect(onPick).toHaveBeenCalledWith(items[1]);
  });

  it("does not rank or flag the popular-products filler", () => {
    render(<TrendingList items={items} ranked={false} onPick={() => {}} />);
    expect(screen.queryByText("Top trending")).toBeNull();
  });
});
