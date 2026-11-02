import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Outlet } from "react-router-dom";

// The route is registered from import.meta.env.DEV. A production build sets it to false at build time, which also removes
// the page's code from the bundle (checked by building: the string "data-table-test" is not in admin/dist).
vi.mock("./auth/RequireAdmin.jsx", () => ({ default: () => <Outlet /> }));
vi.mock("./layouts/AdminLayout.jsx", () => ({ default: () => <Outlet /> }));
vi.mock("./pages/DataTableTestPage.jsx", () => ({ default: () => <p>Data table test page</p> }));
vi.mock("./pages/NotFoundPage.jsx", () => ({ default: () => <p>Page not found</p> }));

async function renderAppAt(path, { dev }) {
  vi.stubEnv("DEV", dev);
  vi.resetModules();
  const { default: App } = await import("./App.jsx");
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("/admin/table-test (developer page)", () => {
  it("is not reachable in a production build, for any signed-in admin: it is simply not found", async () => {
    await renderAppAt("/admin/table-test", { dev: false });
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByText("Data table test page")).not.toBeInTheDocument();
  });

  it("is available while developing", async () => {
    await renderAppAt("/admin/table-test", { dev: true });
    expect(await screen.findByText("Data table test page")).toBeInTheDocument();
  });
});
