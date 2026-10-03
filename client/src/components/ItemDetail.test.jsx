import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemDetail from "./ItemDetail.jsx";

const pricing = (regular, sale) => ({
  regularPrice: regular,
  salePrice: sale,
  savings: regular - sale,
  discountPercent: Math.round(((regular - sale) / regular) * 100),
  unit: null,
  variants: []
});

const base = {
  id: "fade",
  name: "Fade and beard",
  description: "Sharp.",
  images: [{ id: "i1", url: "a.png", caption: "x" }],
  specs: [{ label: "Duration", value: "45 minutes" }],
  availability: "available",
  section: "Cuts",
  business: { slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true }
};

const selective = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Other ${i}`, imageUrl: "b.png", availability: "available", pricing: pricing(100, 100) }));

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), items: mocks }));

const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemDetail business={{ id: "b_001", slug: "fade-kings", name: "Fade Kings" }} itemId="fade" onClose={() => {}} onSelect={() => {}} onReport={() => {}} {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );

const chatHrefs = () => screen.getAllByRole("link", { name: /Chat Seller/ }).map((a) => decodeURIComponent(a.getAttribute("href")));

describe("ItemDetail", () => {
  it("builds the regular chat message and links Visit Store", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw Fade and beard (KES 300) on EpicMKT");
    expect(screen.getAllByRole("link", { name: /Visit Store/ })[0]).toHaveAttribute("href", "/b/fade-kings");
  });

  it("uses the flash sale wording and shows both prices", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 240) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw the flash sale on Fade and beard: KES 240 (was KES 300) on EpicMKT");
    expect(screen.getByText("KSh 240")).toBeInTheDocument();
  });

  it("includes the chosen variant in the message", async () => {
    const variants = [
      { id: "s", label: "Small", regularPrice: 3500, salePrice: 3500, savings: 0, discountPercent: 0 },
      { id: "m", label: "Medium", regularPrice: 2500, salePrice: 2500, savings: 0, discountPercent: 0 }
    ];
    mocks.getDetail.mockResolvedValue({ ...base, pricing: { ...pricing(2500, 2500), variants } });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("radio", { name: "Medium", checked: true });
    await userEvent.setup().click(screen.getByRole("radio", { name: "Small" }));
    expect(chatHrefs()[0]).toContain("Fade and beard (Small) (KES 3,500)");
  });

  it("hides Store Selective with fewer than 2 other items", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue(selective(1));
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    await waitFor(() => expect(mocks.getStoreSelective).toHaveBeenCalled());
    expect(screen.queryByText("Store Selective")).not.toBeInTheDocument();
  });

  it("shows Store Selective and swaps item on select", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue(selective(3));
    const onSelect = vi.fn();
    mount({ onSelect });
    await screen.findByText("Store Selective");
    expect(screen.getByRole("link", { name: /See all in store/ })).toHaveAttribute("href", "/b/fade-kings");
    await userEvent.setup().click(await screen.findByRole("button", { name: /Other 1/ }));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("closes on Escape", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    const onClose = vi.fn();
    mount({ onClose });
    await screen.findByRole("heading", { name: "Fade and beard" });
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
