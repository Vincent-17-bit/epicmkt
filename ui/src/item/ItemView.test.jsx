import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemView from "./ItemView.jsx";
import { ITEM_LABELS } from "./labels.js";

const pricing = (price, variants = []) => ({ regularPrice: price, salePrice: price, savings: 0, discountPercent: 0, unit: null, variants });
const variant = (id, label, price) => ({ id, label, regularPrice: price, salePrice: price, savings: 0, discountPercent: 0 });
const item = (extra = {}) => ({
  id: "i1",
  name: "Fade cut",
  brand: null,
  shortDescription: "Clean and quick",
  description: "",
  section: null,
  packSize: null,
  availability: "available",
  highlights: [],
  specs: [],
  includes: [],
  terms: "",
  images: [],
  videos: [],
  media: [],
  offers: [],
  flash: null,
  pricing: pricing(500),
  business: { slug: "demo", name: "Demo", whatsapp: "254712345678", phone: "0712345678", isOpen: true, townName: "Maseno", verified: false, logo: null, productCount: 3 },
  ...extra
});
const business = { slug: "demo", name: "Demo", category: { singular: "Barbershop" }, attributes: {}, productCount: 3 };
const view = (props = {}) => render(<ItemView layout="page" state="ready" item={item()} itemId="i1" business={business} {...props} />);

describe("ItemView", () => {
  it("renders the item with its price and seller", () => {
    view();
    expect(screen.getByRole("heading", { level: 1, name: "Fade cut" })).toBeInTheDocument();
    expect(screen.getByText("KES 500")).toBeInTheDocument();
    expect(screen.getByText("3 products")).toBeInTheDocument();
  });

  it("in preview mode has no live links and disabled buttons", () => {
    view({ mode: "preview" });
    for (const label of screen.getAllByText(ITEM_LABELS["item.chatSeller"])) expect(label.closest("a")).not.toHaveAttribute("href");
    for (const label of screen.getAllByText(ITEM_LABELS["item.visitStore"])) expect(label.closest("a")).not.toHaveAttribute("href");
    expect(screen.getByRole("button", { name: new RegExp(ITEM_LABELS["item.share"]) })).toBeDisabled();
  });

  it("in live mode links to chat and reports the variant chosen", async () => {
    const user = userEvent.setup();
    const onChat = vi.fn();
    view({ onChat, item: item({ pricing: pricing(500, [variant("a", "Small", 500), variant("b", "Large", 800)]) }) });
    await user.click(screen.getByRole("radio", { name: "Large" }));
    expect(screen.getByText("KES 800")).toBeInTheDocument();
    const chat = screen.getAllByText(ITEM_LABELS["item.chatSeller"])[0].closest("a");
    expect(chat.getAttribute("href")).toContain("wa.me");
    await user.click(chat);
    expect(onChat).toHaveBeenCalledWith("card", expect.objectContaining({ id: "b" }));
  });

  it("marks the parts the caller asks for", () => {
    view({ marks: (part) => (part === "name" ? "" : undefined) });
    expect(document.querySelectorAll("[data-hl]")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("data-hl");
  });

  it("uses the labels it is given before its own", () => {
    view({ labels: { "item.soldBy": "Muuzaji" } });
    expect(screen.getAllByText("Muuzaji").length).toBeGreaterThan(0);
  });

  it("shows the loading, gone and failed states", () => {
    const { rerender } = view({ state: "loading", item: null });
    expect(document.querySelector("[aria-busy='true']")).toBeInTheDocument();
    rerender(<ItemView layout="page" state="gone" itemId="i1" business={business} />);
    expect(screen.getByText(ITEM_LABELS["item.gone"])).toBeInTheDocument();
    rerender(<ItemView layout="page" state="failed" itemId="i1" business={business} />);
    expect(screen.getByRole("alert")).toHaveTextContent(ITEM_LABELS["item.loadFailed"]);
  });
});
