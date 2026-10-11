import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BusinessPage, ProductCard, ShopCard } from "./index.js";
import { business, item, pageProps } from "./test/fixtures.js";

const handlers = () => ({ onSelect: vi.fn(), onContact: vi.fn(), onShare: vi.fn(), onOpenItem: vi.fn(), onReport: vi.fn() });

const renderers = {
  ProductCard: (extra = {}) => {
    const h = handlers();
    return { h, ...render(<ProductCard item={item} onSelect={h.onSelect} {...extra} />) };
  },
  ShopCard: (extra = {}) => {
    const h = handlers();
    return { h, ...render(<ShopCard business={business} href="/b/fade-kings" onContact={h.onContact} {...extra} />) };
  },
  BusinessPage: (extra = {}) => {
    const h = handlers();
    return { h, ...render(<BusinessPage {...pageProps} onContact={h.onContact} onShare={h.onShare} onOpenItem={h.onOpenItem} onReport={h.onReport} {...extra} />) };
  }
};

const inertCheck = (container) => {
  const live = (el) => !el.closest("dialog:not([open])");
  const links = [...container.querySelectorAll("a")].filter(live);
  const buttons = [...container.querySelectorAll("button")].filter(live);
  expect(links.length + buttons.length).toBeGreaterThan(0);
  links.forEach((a) => expect(a).not.toHaveAttribute("href"));
  buttons.forEach((b) => expect(b.disabled || b.getAttribute("aria-disabled") === "true").toBe(true));
};

describe.each(Object.keys(renderers))("%s preview mode", (name) => {
  it("has no live links and no enabled buttons", () => {
    const { container } = renderers[name]({ mode: "preview" });
    inertCheck(container);
  });

  it("does not call back or track when clicked", () => {
    const { container, h } = renderers[name]({ mode: "preview" });
    container.querySelectorAll("a, button").forEach((el) => fireEvent.click(el));
    Object.values(h).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it("marks itself as preview", () => {
    const { container } = renderers[name]({ mode: "preview" });
    expect(container.querySelector('[data-mode="preview"]')).not.toBeNull();
  });
});

describe("live mode still works", () => {
  it("ProductCard selects the item", () => {
    const { h } = renderers.ProductCard();
    fireEvent.click(screen.getByRole("button"));
    expect(h.onSelect).toHaveBeenCalledWith(item);
  });

  it("ShopCard links and tracks contacts", () => {
    const { h } = renderers.ShopCard();
    expect(screen.getAllByRole("link", { name: /Fade Kings/ })[0]).toHaveAttribute("href", "/b/fade-kings");
    fireEvent.click(screen.getByText("Call").closest("a"));
    expect(h.onContact).toHaveBeenCalledWith(business, "call");
  });

  it("BusinessPage opens an item and shares", () => {
    const { h } = renderers.BusinessPage();
    fireEvent.click(screen.getByRole("button", { name: /Fade/ }));
    expect(h.onOpenItem).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getAllByRole("button", { name: "Share" })[0]);
    expect(h.onShare).toHaveBeenCalled();
  });

  it("ShopCard uses renderLink", () => {
    render(<ShopCard business={business} href="/x" renderLink={({ href, children, ...rest }) => <a data-custom href={`/app${href}`} {...rest}>{children}</a>} />);
    expect(document.querySelector("[data-custom]")).toHaveAttribute("href", "/app/x");
  });
});

describe.each(Object.keys(renderers))("%s slots", (name) => {
  it("renders overlay and quickActions", () => {
    const { container } = renderers[name]({ overlay: <span>Hidden by me</span>, quickActions: <button type="button">Hide</button> });
    const overlay = container.querySelector('[data-slot="overlay"]');
    const actions = container.querySelector('[data-slot="quick-actions"]');
    expect(within(overlay).getByText("Hidden by me")).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Hide" })).toBeEnabled();
  });

  it("renders no slot markup when none are given", () => {
    const { container } = renderers[name]();
    expect(container.querySelector("[data-slot]")).toBeNull();
  });

  it("keeps slot controls live in preview mode", () => {
    const onClick = vi.fn();
    const { container } = renderers[name]({ mode: "preview", quickActions: <button type="button" onClick={onClick}>Hide</button> });
    fireEvent.click(within(container.querySelector('[data-slot="quick-actions"]')).getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
