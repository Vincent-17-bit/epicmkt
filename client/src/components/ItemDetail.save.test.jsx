import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { phone } from "@epicmkt/shared/options/fixtures";
import ItemDetail from "./ItemDetail.jsx";
import { savedList } from "../lib/savedList.js";
import { useToastStore } from "../stores/toast.js";

// Save on the item page: the option and the quantity the buyer chose, kept in step with the page, and never in the seller's preview.
const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent: vi.fn(), items: mocks }));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

const seller = { slug: "shop", name: "Shop", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true };
const pricing = (n) => ({ regularPrice: n, salePrice: n, savings: 0, discountPercent: 0, unit: null, variants: [] });
const detail = (over = {}) => {
  const f = phone();
  return { id: "it", businessId: "b1", businessSlug: "shop", name: f.item.name, description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: { ...seller, id: "b1" }, pricing: pricing(f.item.price), options: f.options, optionVariants: f.optionVariants, defaultVariantId: f.defaultVariantId, ...over };
};
const plain = (over = {}) => ({ id: "it", businessId: "b1", businessSlug: "shop", name: "Lamp", description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: { ...seller, id: "b1" }, pricing: pricing(900), ...over });

const mount = (data, props = {}) => {
  mocks.getStoreSelective.mockResolvedValue([]);
  mocks.getDetail.mockResolvedValue(data);
  return render(
    <MemoryRouter initialEntries={["/?item=it"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemDetail business={{ id: "b1", slug: "shop", name: "Shop" }} itemId="it" onClose={() => {}} onSelect={() => {}} onReport={() => {}} {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );
};
const footerSave = () => screen.getByTestId("save-footer");

beforeEach(() => {
  savedList().clear();
  useToastStore.setState({ toasts: [] });
});

describe("Save on the item page", () => {
  it("saves the item with its quantity; tapping again removes it with Undo", async () => {
    mount(plain());
    await screen.findByRole("heading", { name: "Lamp" });
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await userEvent.click(footerSave());
    expect(savedList().list()[0]).toMatchObject({ itemId: "it", businessId: "b1", qty: 2, optionParam: "", kind: "product" });
    expect(savedList().list()[0].snap).toMatchObject({ name: "Lamp", unit: 900, businessName: "Shop" });
    expect(footerSave()).toHaveAttribute("aria-pressed", "true");
    expect(useToastStore.getState().toasts.at(-1).message).toBe("Saved");
    await userEvent.click(footerSave());
    expect(savedList().count()).toBe(0);
    expect(useToastStore.getState().toasts.at(-1).action.label).toBe("Undo");
  });

  it("the footer's Save comes first, before Chat with seller, and the seller card has one too", async () => {
    mount(plain());
    await screen.findByRole("heading", { name: "Lamp" });
    const footer = footerSave().closest("footer");
    const order = within(footer).getAllByRole("button").concat(within(footer).getAllByRole("link"));
    expect(footer.firstElementChild).toBe(footerSave());
    expect(order.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("save-card")).toBeInTheDocument();
  });

  it("saves the chosen option and its label, the way ?v= names it", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Storage:/ })).getByRole("radio", { name: /256 GB/ }));
    await userEvent.click(footerSave());
    expect(savedList().list()[0]).toMatchObject({ optionParam: "grey.256", optionLabel: "Grey / 256 GB" });
  });

  it("converts a line saved without options instead of adding a second one", async () => {
    savedList().add({ itemId: "it", businessId: "b1", businessSlug: "shop", qty: 3, snap: { name: "x" } });
    mount(detail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(footerSave());
    expect(savedList().count()).toBe(1);
    expect(savedList().list()[0].optionParam).toMatch(/\./);
  });

  it("starts at the saved quantity and keeps the saved line in step (300 ms, no toast)", async () => {
    savedList().add({ itemId: "it", businessId: "b1", businessSlug: "shop", qty: 4, snap: { name: "Lamp", unit: 900 } });
    mount(plain());
    await screen.findByRole("heading", { name: "Lamp" });
    expect(screen.getByRole("textbox", { name: /How many/ })).toHaveValue("4");
    useToastStore.setState({ toasts: [] });
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await waitFor(() => expect(savedList().list()[0].qty).toBe(5), { timeout: 2000 });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("shows each option's own saved state", async () => {
    savedList().add({ itemId: "it", businessId: "b1", businessSlug: "shop", optionParam: "grey.256", optionLabel: "Grey / 256 GB", qty: 1, snap: { name: "x" } });
    mount(detail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(footerSave()).toHaveAttribute("aria-pressed", "false"); // Grey / 128 GB is the default
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Storage:/ })).getByRole("radio", { name: /256 GB/ }));
    expect(footerSave()).toHaveAttribute("aria-pressed", "true");
  });

  it("the price shows the total with a 'for 3' label and no formula anywhere", async () => {
    mount(plain({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Lamp" });
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getByTestId("price-for")).toHaveTextContent("for 3");
    expect(screen.getByTestId("price-for").parentElement).toHaveTextContent("KES 2,700"); // the price at the top (the Order button repeats it)
    expect(document.body.textContent).not.toMatch(/\bx \d|=\s*KES/);
  });

  it("is absent in the seller's preview, and writes nothing", async () => {
    mount(null, { preview: plain() });
    await screen.findByRole("heading", { name: "Lamp" });
    expect(screen.queryByTestId("save-footer")).toBeNull();
    expect(screen.queryByTestId("save-card")).toBeNull();
    expect(savedList().count()).toBe(0);
  });

  it("has no accessibility violations", async () => {
    const { container } = mount(plain());
    await screen.findByRole("heading", { name: "Lamp" });
    expect((await axe(container)).violations).toEqual([]);
  });
});
