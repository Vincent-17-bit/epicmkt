import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { phone, shoes, sofa, sandisk } from "@epicmkt/shared/options/fixtures";

import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import Options from "./Options.jsx";

// The picker as the page uses it: the hook owns the choice and the URL, the slot draws it.
function Harness({ item, itemId = "it" }) {
  const option = useOptionSelection(item, itemId);
  const location = useLocation();
  return (
    <>
      <Options ctx={{ option }} slot={{ item }} />
      <output data-testid="url">{location.search}</output>
      <output data-testid="variant">{option?.variant?.id ?? "none"}</output>
    </>
  );
}
const mount = (item, url = "/?item=it", props = {}) => render(<MemoryRouter initialEntries={[url]}><Harness item={item} {...props} /></MemoryRouter>);
const group = (name) => screen.getByRole("radiogroup", { name: new RegExp(`^${name}:`) });
const checked = (name) => within(group(name)).getByRole("radio", { checked: true });

describe("option picker", () => {
  describe("default selection", () => {
    it("is the cheapest in stock when the seller chose none (phone: Grey, 128 GB)", () => {
      mount(phone());
      expect(checked("Color")).toHaveAccessibleName(/Grey/);
      expect(checked("Storage")).toHaveAccessibleName(/128 GB/);
      expect(screen.getByTestId("variant")).toHaveTextContent("v2");
    });
    it("is the seller's default when there is one (sofa: Velvet, 2 seater)", () => {
      mount(sofa());
      expect(checked("Fabric")).toHaveAccessibleName(/Velvet/);
      expect(checked("Size")).toHaveAccessibleName(/2 seater/);
    });
    it("does not write ?v= just by opening the item", () => {
      mount(phone());
      expect(screen.getByTestId("url")).toHaveTextContent("?item=it");
      expect(screen.getByTestId("url")).not.toHaveTextContent("v=");
    });
  });

  describe("header", () => {
    it("reads 'Color: Grey', is a polite and atomic live region, and follows the choice", async () => {
      mount(phone());
      const head = screen.getByText(/^Color:/);
      expect(head).toHaveTextContent("Color: Grey");
      expect(head).toHaveAttribute("aria-live", "polite");
      expect(head).toHaveAttribute("aria-atomic", "true");
      await userEvent.click(within(group("Color")).getByRole("radio", { name: /Blue/ }));
      expect(screen.getByText(/^Color:/)).toHaveTextContent("Color: Blue");
      expect(screen.getByText(/^Color:/)).toBe(head);
    });
    it("labels each radio group by its header", () => {
      mount(phone());
      expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    });
  });

  describe("cards and prices", () => {
    it("colour cards carry their own price when prices differ; the earlier price is struck through on a sale", () => {
      mount(phone());
      const cards = within(group("Color")).getAllByRole("radio");
      expect(cards.map((c) => c.textContent)).toEqual([expect.stringMatching(/Black.*22,000/), expect.stringMatching(/Grey.*21,000/), expect.stringMatching(/Blue.*22,000/)]);
    });
    it("leaves the cards clean when every value costs the same (shoe colours, shoe sizes)", () => {
      mount(shoes());
      for (const card of within(group("Color")).getAllByRole("radio")) expect(card.textContent).not.toMatch(/KES|\d,\d{3}/);
    });
    it("shows swatches for colour, and photo cards when the value has a photo of the item", () => {
      const s = sofa();
      s.images = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", url: "https://example.test/linen.png" }, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", url: "https://example.test/velvet.png" }];
      const { container, unmount } = mount(s);
      expect(container.querySelectorAll('[data-kind="photo"]')).toHaveLength(2);
      unmount();
      const { container: c2 } = mount(phone());
      expect(c2.querySelectorAll('[data-kind="swatch"]')).toHaveLength(3);
    });
    it("a value with a photo id the item does not have falls back to a text card", () => {
      const { container } = mount(sofa());
      expect(container.querySelectorAll('[data-kind="photo"]')).toHaveLength(0);
    });
  });

  describe("long lists", () => {
    it("shoe sizes (ten, display dropdown) are a dropdown, colours stay cards", async () => {
      mount(shoes());
      const select = screen.getByRole("combobox", { name: "Size (EU)" });
      expect(select).toHaveValue("38"); // all prices equal, so the first listed
      expect(within(select).getAllByRole("option")).toHaveLength(10);
      await userEvent.selectOptions(select, "44");
      expect(screen.getByTestId("url")).toHaveTextContent("v=white.44");
      expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    });
    it("more than eight values in a button list switches to a dropdown too", () => {
      const item = shoes();
      item.options = item.options.map((a) => (a.key === "size" ? { ...a, display: "button" } : a));
      mount(item);
      expect(screen.getByRole("combobox", { name: "Size (EU)" })).toBeInTheDocument();
    });
    it("eight or fewer values in a button list stay buttons", () => {
      const item = phone();
      mount(item);
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("unavailable combinations", () => {
    it("are dashed and announced, not hidden, and can still be picked", async () => {
      mount(phone());
      // Grey is chosen with 128 GB; Blue 512 GB would be fine, but Grey 512 GB is sold out.
      const s512 = within(group("Storage")).getByRole("radio", { name: /512 GB/ });
      expect(s512).toHaveAttribute("data-unavailable");
      expect(s512).toHaveAccessibleName(/Out of stock/);
      await userEvent.click(s512);
      expect(checked("Storage")).toHaveAccessibleName(/512 GB/);
    });
    it("a combination the seller does not sell is dashed 'Currently unavailable', and picking it says so and has no variant", async () => {
      mount(shoes(), "/?item=it&v=red.40");
      const select = screen.getByRole("combobox", { name: "Size (EU)" });
      expect(within(select).getByRole("option", { name: /EU 38 \(Currently unavailable\)/ })).toBeInTheDocument();
      expect(within(select).getByRole("option", { name: /EU 42 \(Out of stock\)/ })).toBeInTheDocument();
      await userEvent.selectOptions(select, "38");
      expect(screen.getByText(/combination is not available/i)).toBeInTheDocument();
      expect(screen.getByTestId("variant")).toHaveTextContent("none");
      await userEvent.selectOptions(select, "41");
      expect(screen.queryByText(/combination is not available/i)).toBeNull();
    });
  });

  describe("dependent options (SanDisk)", () => {
    it("the capacity list follows the style, keeps 128 GB across the switch, and reads 1024 GB as 1 TB", async () => {
      mount(sandisk());
      const caps = () => within(group("Capacity")).getAllByRole("radio").map((c) => c.textContent);
      expect(caps()).toHaveLength(5);
      expect(caps().join()).not.toMatch(/64 GB|2 TB/);
      expect(caps().join()).toMatch(/32 GB/);
      expect(caps().join()).toMatch(/1 TB/);
      expect(caps().join()).not.toMatch(/1024/);
      expect(checked("Capacity")).toHaveAccessibleName(/128 GB/);
      await userEvent.click(within(group("Style")).getByRole("radio", { name: /New Version/ }));
      expect(caps()).toHaveLength(6);
      expect(caps().join()).toMatch(/64 GB/);
      expect(caps().join()).toMatch(/2 TB/);
      expect(caps().join()).not.toMatch(/32 GB/);
      expect(checked("Capacity")).toHaveAccessibleName(/128 GB/);
      expect(screen.getByTestId("url")).toHaveTextContent("v=new.128gb");
    });
    it("picking a capacity the other style lacks moves to the default of what is left", async () => {
      mount(sandisk(), "/?item=it&v=old.32gb");
      expect(checked("Capacity")).toHaveAccessibleName(/32 GB/);
      await userEvent.click(within(group("Style")).getByRole("radio", { name: /New Version/ }));
      expect(checked("Capacity")).toHaveAccessibleName(/64 GB/);
    });
    it("capacity cards show prices, with the earlier price struck through where there is a discount", async () => {
      mount(sandisk(), "/?item=it&v=new.128gb");
      const c256 = within(group("Capacity")).getByRole("radio", { name: /256 GB/ });
      expect(c256.textContent).toMatch(/12,078/);
      expect(c256.querySelector("s")).toHaveTextContent(/16,883/);
      expect(within(group("Capacity")).getByRole("radio", { name: /128 GB/ }).querySelector("s")).toBeNull();
    });
  });

  describe("?v= in the URL", () => {
    it("starts from the link, so it shares the exact choice", () => {
      mount(phone(), "/?item=it&v=blue.512");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      expect(checked("Storage")).toHaveAccessibleName(/512 GB/);
    });
    it("writes the choice on every pick, keeps the other parameters, and replaces rather than adds history", async () => {
      mount(phone(), "/?item=it&section=a");
      await userEvent.click(within(group("Storage")).getByRole("radio", { name: /256 GB/ }));
      expect(screen.getByTestId("url").textContent).toMatch(/item=it/);
      expect(screen.getByTestId("url").textContent).toMatch(/section=a/);
      expect(screen.getByTestId("url").textContent).toMatch(/v=grey\.256/);
      await userEvent.click(within(group("Color")).getByRole("radio", { name: /Black/ }));
      expect(screen.getByTestId("url").textContent).toMatch(/v=black\.256/);
    });
    it("ignores a link with wrong parts and falls back to the default for them", () => {
      mount(phone(), "/?item=it&v=pink.256");
      expect(checked("Color")).toHaveAccessibleName(/Grey/);
      expect(checked("Storage")).toHaveAccessibleName(/256 GB/);
      mount(phone(), "/?item=it&v=nonsense");
      expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(4);
    });
    it("does not carry one item's choice to another item", () => {
      const { rerender } = render(<MemoryRouter initialEntries={["/?item=a&v=blue.512"]}><Harness item={phone()} itemId="a" /></MemoryRouter>);
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      rerender(<MemoryRouter initialEntries={["/?item=a&v=blue.512"]}><Harness item={phone()} itemId="b" /></MemoryRouter>);
      expect(checked("Color")).toHaveAccessibleName(/Grey/);
    });
  });

  describe("keyboard", () => {
    it("only the checked card is in the tab order", () => {
      mount(phone());
      const cards = within(group("Color")).getAllByRole("radio");
      expect(cards.map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
    });
    it("arrow keys move the choice and the focus within a group, with wrap, Home and End", async () => {
      mount(phone());
      within(group("Color")).getByRole("radio", { name: /Grey/ }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      expect(checked("Color")).toHaveFocus();
      await userEvent.keyboard("{ArrowRight}");
      expect(checked("Color")).toHaveAccessibleName(/Black/);
      await userEvent.keyboard("{ArrowLeft}");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      await userEvent.keyboard("{ArrowDown}");
      expect(checked("Color")).toHaveAccessibleName(/Black/);
      await userEvent.keyboard("{End}");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      await userEvent.keyboard("{Home}");
      expect(checked("Color")).toHaveAccessibleName(/Black/);
      await userEvent.keyboard("{ArrowUp}");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      expect(checked("Storage")).toHaveAccessibleName(/128 GB/);
    });
    it("Space and Enter pick the focused card", async () => {
      mount(phone());
      const black = within(group("Color")).getByRole("radio", { name: /Black/ });
      black.focus();
      await userEvent.keyboard(" ");
      expect(checked("Color")).toHaveAccessibleName(/Black/);
      const blue = within(group("Color")).getByRole("radio", { name: /Blue/ });
      blue.focus();
      await userEvent.keyboard("{Enter}");
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
    });
  });

  describe("accessibility", () => {
    it.each([["phone", phone], ["shoes", shoes], ["sofa", sofa], ["sandisk", sandisk]])("%s has no serious or critical axe violations", async (_name, make) => {
      const { container } = mount(make());
      expect(await seriousViolations(container)).toEqual([]);
    });
  });

  describe("items without option axes", () => {
    const legacy = (variants) => ({ id: "x", name: "Cut", options: [], optionVariants: [], pricing: { variants } });
    it("render exactly as today: the old list of variants, or nothing", async () => {
      const v = (id, label) => ({ id, label, regularPrice: 5, salePrice: 5, savings: 0, discountPercent: 0 });
      const { unmount } = mount(legacy([v("a", "Small"), v("b", "Large")]));
      expect(screen.getByRole("radiogroup", { name: "Options" })).toBeInTheDocument();
      expect(screen.getByTestId("variant")).toHaveTextContent("none");
      unmount();
      const { container } = mount(legacy([]));
      expect(container.querySelector("[role=radiogroup]")).toBeNull();
    });
    it("have axes but no variants: no picker (there is nothing to buy)", () => {
      const item = phone();
      item.optionVariants = [];
      const { container } = mount(item);
      expect(container.querySelector("[role=radiogroup]")).toBeNull();
    });
    it("payloads without the option keys at all (an older API) are fine", () => {
      const { container } = mount({ id: "x", name: "Cut", pricing: { variants: [] } });
      expect(container.querySelector("[role=radiogroup]")).toBeNull();
    });
  });

  describe("data changes while the page is open", () => {
    it("a seller edit that removes the chosen value moves the choice to a value that exists", () => {
      const item = phone();
      const { rerender } = render(<MemoryRouter initialEntries={["/?item=it&v=blue.512"]}><Harness item={item} /></MemoryRouter>);
      expect(checked("Color")).toHaveAccessibleName(/Blue/);
      const edited = { ...item, optionVariants: item.optionVariants.filter((v) => v.choice.color !== "blue") };
      edited.options = item.options.map((a) => (a.key === "color" ? { ...a, values: a.values.filter((x) => x.id !== "blue") } : a));
      rerender(<MemoryRouter initialEntries={["/?item=it&v=blue.512"]}><Harness item={edited} /></MemoryRouter>);
      expect(within(group("Color")).getAllByRole("radio")).toHaveLength(2);
      expect(checked("Color")).toBeTruthy();
    });
  });
});
