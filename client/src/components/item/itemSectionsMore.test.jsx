import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompareTable, ItemIncluded, ItemVideos } from "./ItemSections.jsx";
import ProductInformation from "./ProductInformation.jsx";

const mocks = vi.hoisted(() => ({ similar: [], getDetail: vi.fn() }));
vi.mock("../SimilarItems.jsx", () => ({ useSimilar: () => ({ data: mocks.similar, isPending: false }) }));
vi.mock("../../api/index.js", () => ({ items: { getDetail: (...a) => mocks.getDetail(...a) } }));

const phoneScreen = (on) => {
  window.matchMedia = (query) => ({ matches: on && query.includes("max-width"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
};
const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; });

describe("What's included", () => {
  it("shows pictured lines as tiles and the rest as a list, with the count under the title", () => {
    const item = { includes: ["Speaker", "Cable: 1 m", "Guide"], includePhotos: ["/s.jpg", null, null] };
    render(<ItemIncluded item={item} />);
    expect(screen.getByRole("heading", { name: "What's included" })).toBeInTheDocument();
    expect(screen.getByText("3 items in the box")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Speaker" })).toHaveAttribute("src", "/s.jpg");
    expect(screen.getByText("Cable:")).toBeInTheDocument();
    expect(screen.getByText("Guide")).toBeInTheDocument();
  });
});

describe("Videos", () => {
  const vids = [
    { id: "v1", url: "/a.mp4", caption: "Overview", poster: "/a.jpg", duration: 75, by: "JBL" },
    { id: "v2", url: "/b.mp4", caption: "Speaker", poster: "" },
    { id: "v3", url: "/c.mp4", caption: "" }
  ];

  it("lists every video beside the player; picking one plays it and marks it as playing", () => {
    const { container } = render(<ItemVideos item={{ name: "Speaker", videos: vids }} />);
    const list = screen.getByRole("list", { name: "Videos for this product" });
    const buttons = within(list).getAllByRole("button");
    // A caption that only repeats the item's name (what the live API sends) is numbered instead.
    expect(buttons.map((b) => b.textContent)).toEqual(["1:15Now playingOverviewJBL", "Video 2", "Video 3"]);
    expect(buttons[0]).toHaveAttribute("aria-current", "true");
    expect(container.querySelector("video")).toHaveAttribute("src", "/a.mp4");
    expect(container.querySelector("video")).not.toHaveAttribute("autoplay");
    fireEvent.click(buttons[2]);
    expect(container.querySelector("video")).toHaveAttribute("src", "/c.mp4");
    expect(container.querySelector("video")).toHaveAttribute("autoplay");
    expect(buttons[2]).toHaveAttribute("aria-current", "true");
    expect(buttons[0]).not.toHaveAttribute("aria-current");
  });

  it("has no list for a single video, and nothing at all without one", () => {
    const { container, rerender } = render(<ItemVideos item={{ name: "Speaker", videos: [vids[0]] }} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(container.querySelector("video")).toHaveAttribute("src", "/a.mp4");
    rerender(<ItemVideos item={{ name: "Speaker", videos: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Product information", () => {
  const specs = [
    { group: "Info: Product details", label: "Model", value: "Flip 6" },
    { group: "Info: Sound", label: "Power", value: "30 W" },
    { group: "Info: Battery", label: "Playtime", value: "12 hours" },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ group: "Info: FAQ", label: `Question ${n}?`, value: `Answer ${n}.` }))
  ];

  it("opens the first two groups as tables; Expand all opens the rest", () => {
    render(<ProductInformation item={{ specs }} />);
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => within(h).getByRole("button"));
    expect(heads.map((b) => [b.textContent, b.getAttribute("aria-expanded")])).toEqual([["Product details1", "true"], ["Sound1", "true"], ["Battery1", "false"]]);
    expect(screen.getByRole("rowheader", { name: "Model" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Flip 6" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("button", { name: /Battery/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getByRole("button", { name: /Product details/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("lists questions with their answers, four at first, then all", () => {
    render(<ProductInformation item={{ specs }} />);
    expect(screen.getByText("From the seller · 6 answers")).toBeInTheDocument();
    expect(screen.getByText("Answer 4.")).toBeInTheDocument();
    expect(screen.queryByText("Question 5?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See all 6 questions" }));
    expect(screen.getByText("Answer 6.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer questions" })).toHaveAttribute("aria-expanded", "true");
  });

  it("is left out with no facts and no questions", () => {
    const { container } = render(<ProductInformation item={{ specs: [{ label: "Colour", value: "Red" }] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Compare with similar items", () => {
  const mine = { id: "a", name: "Flip 6", brand: "JBL", pricing: { salePrice: 14500 }, business: { id: "b1", slug: "shop-a", name: "Shop A", townName: "Nakuru" }, specs: [] };
  const other = { id: "b", name: "SoundCore", brand: "Anker", pricing: { salePrice: 9000 }, business: { id: "b2", slug: "shop-b", name: "Shop B", townName: "Kisumu" }, specs: [] };
  const draw = () => render(
    <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CompareTable item={mine} business={mine.business} />
    </QueryClientProvider></MemoryRouter>
  );

  it("puts the feature names in a first column on big screens", async () => {
    phoneScreen(false);
    mocks.similar = [other];
    mocks.getDetail.mockResolvedValue(other);
    draw();
    await waitFor(() => expect(screen.getByText(/features across 2 items/)).toBeInTheDocument());
    expect(screen.getByRole("rowheader", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByText("Lowest price")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View SoundCore" })).toHaveAttribute("href", "/b/shop-b/i/b");
  });

  it("on a phone puts each feature's name on a line above its values, tied to them for screen readers", async () => {
    phoneScreen(true);
    mocks.similar = [other];
    mocks.getDetail.mockResolvedValue(other);
    draw();
    await waitFor(() => expect(screen.getByText(/features across 2 items/)).toBeInTheDocument());
    expect(screen.queryByRole("rowheader")).not.toBeInTheDocument();
    const name = screen.getByRole("columnheader", { name: "Brand" });
    const cell = screen.getByRole("cell", { name: "Anker" });
    expect(cell.getAttribute("headers").split(" ")).toContain(name.id);
    // Only the items' columns: no empty first column.
    expect(screen.getAllByRole("columnheader").filter((th) => th.getAttribute("scope") === "col")).toHaveLength(2);
  });

  it("shows only the rows that differ when asked", async () => {
    phoneScreen(false);
    mocks.similar = [other];
    mocks.getDetail.mockResolvedValue(other);
    draw();
    await waitFor(() => expect(screen.getByText(/features across 2 items/)).toBeInTheDocument());
    expect(screen.getByRole("rowheader", { name: "Availability" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show differences only" }));
    expect(screen.queryByRole("rowheader", { name: "Availability" })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Brand" })).toBeInTheDocument();
  });
});
