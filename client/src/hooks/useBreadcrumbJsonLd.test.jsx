import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import { t } from "../i18n/index.js";

vi.mock("../api/index.js", () => ({ logEvent: vi.fn(), getBusiness: vi.fn(), getCategories: vi.fn(), getTowns: vi.fn(), getSearchFacets: vi.fn() }));

let go;
function Nav() {
  go = useNavigate();
  return null;
}

const mount = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={new QueryClient()}>
        <Nav />
        <PageBreadcrumbs />
      </QueryClientProvider>
    </MemoryRouter>
  );

const scripts = () => [...document.querySelectorAll('script[type="application/ld+json"]')];
const data = () => JSON.parse(scripts()[0].textContent);

describe("breadcrumb JSON-LD for /flash and /offers", () => {
  it("has the same structure as /sell, with clean URLs", () => {
    const sell = mount("/sell");
    const sellShape = data().itemListElement.map((item) => Object.keys(item));
    sell.unmount();
    mount("/FLASH/?category=x&sort=ending#top");
    const ld = data();
    expect(ld.itemListElement.map((item) => Object.keys(item))).toEqual(sellShape);
    expect(ld.itemListElement.map((item) => [item.position, item.name, item.item])).toEqual([
      [1, "Home", `${window.location.origin}/`],
      [2, "Flash sales", `${window.location.origin}/flash`]
    ]);
  });

  it("keeps exactly one BreadcrumbList across /flash -> /offers -> /flash", async () => {
    mount("/flash");
    expect(scripts()).toHaveLength(1);
    await act(async () => go("/offers"));
    expect(scripts()).toHaveLength(1);
    expect(data().itemListElement[1].item).toMatch(/\/offers$/);
    await act(async () => go("/flash?page=2"));
    expect(scripts()).toHaveLength(1);
    expect(data().itemListElement[1].item).toMatch(/\/flash$/);
  });
});

describe("breadcrumb labels", () => {
  it("are static English text", () => {
    expect(t("breadcrumbs.flashSales")).toBe("Flash sales");
    expect(t("breadcrumbs.offers")).toBe("Offers");
  });
});
