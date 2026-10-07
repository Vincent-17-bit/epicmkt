import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../api/siteConfig.js", () => ({ getSiteConfig: vi.fn() }));

import { getSiteConfig } from "../api/siteConfig.js";
import Footer from "./Footer.jsx";
import AppRedirect from "./AppRedirect.jsx";

const wrap = (ui, path = "/", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => ({
  client,
  ...render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("footer seller links", () => {
  it("shows the four links with the right targets using env defaults", async () => {
    getSiteConfig.mockResolvedValue({});
    wrap(<Footer />);
    expect(screen.getByRole("link", { name: "Become a seller" })).toHaveAttribute("href", "/become-a-seller");
    expect(screen.getByRole("link", { name: "Seller guide" })).toHaveAttribute("href", "/seller-guide");
    expect(screen.getByRole("link", { name: "Check my application" })).toHaveAttribute("href", "/become-a-seller/status");
    await waitFor(() => expect(getSiteConfig).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Seller login" })).toHaveAttribute("href", "http://localhost:5174/login");
  });

  it("opens seller login in the same tab with rel noopener", () => {
    getSiteConfig.mockResolvedValue({});
    wrap(<Footer />);
    const link = screen.getByRole("link", { name: "Seller login" });
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("uses production values from site_config", async () => {
    getSiteConfig.mockResolvedValue({ seller_url: "https://business.epicmkt.co.ke", seller_login_path: "/login" });
    wrap(<Footer />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Seller login" })).toHaveAttribute("href", "https://business.epicmkt.co.ke/login")
    );
  });

  it("changes the link when site_config changes, with no rebuild", async () => {
    getSiteConfig.mockResolvedValue({ seller_url: "https://one.example" });
    const { client } = wrap(<Footer />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Seller login" })).toHaveAttribute("href", "https://one.example/login"));
    getSiteConfig.mockResolvedValue({ seller_url: "https://two.example", seller_login_path: "/signin" });
    await client.invalidateQueries({ queryKey: ["site-config"] });
    await waitFor(() => expect(screen.getByRole("link", { name: "Seller login" })).toHaveAttribute("href", "https://two.example/signin"));
  });

  it("falls back to env when site_config fails", async () => {
    getSiteConfig.mockRejectedValue(new Error("down"));
    wrap(<Footer />);
    await waitFor(() => expect(getSiteConfig).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Seller login" })).toHaveAttribute("href", "http://localhost:5174/login");
  });
});

describe("env resolution per environment", () => {
  it("uses local defaults when nothing is set", async () => {
    vi.stubEnv("VITE_SELLER_URL", "");
    vi.stubEnv("VITE_ADMIN_URL", "");
    vi.stubEnv("VITE_SELLER_LOGIN_PATH", "");
    const { resolveAppLinks } = await import("../lib/appLinks.js");
    expect(resolveAppLinks()).toMatchObject({
      sellerUrl: "http://localhost:5174",
      adminUrl: "http://localhost:5175",
      sellerLogin: "http://localhost:5174/login"
    });
  });

  it("uses production env values", async () => {
    vi.stubEnv("VITE_SELLER_URL", "https://business.epicmkt.co.ke");
    vi.stubEnv("VITE_ADMIN_URL", "https://admin.epicmkt.co.ke");
    vi.stubEnv("VITE_SELLER_LOGIN_PATH", "/login");
    const { resolveAppLinks } = await import("../lib/appLinks.js");
    expect(resolveAppLinks()).toMatchObject({
      sellerUrl: "https://business.epicmkt.co.ke",
      adminUrl: "https://admin.epicmkt.co.ke",
      sellerLogin: "https://business.epicmkt.co.ke/login"
    });
  });

  it("lets site_config override env values", async () => {
    const { resolveAppLinks } = await import("../lib/appLinks.js");
    expect(resolveAppLinks({ seller_url: "https://x.example/", seller_login_path: "signin" }).sellerLogin).toBe("https://x.example/signin");
  });
});

describe("old path redirect", () => {
  const original = window.location;
  const mount = (path) => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { replace } });
    wrap(
      <Routes>
        <Route path="/business/*" element={<AppRedirect app="seller" prefix="/business" />} />
        <Route path="/admin/*" element={<AppRedirect app="admin" prefix="/admin" />} />
      </Routes>,
      path
    );
    return replace;
  };
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

  it("sends /business/login to the seller address", async () => {
    getSiteConfig.mockResolvedValue({ seller_url: "https://business.epicmkt.co.ke" });
    const replace = mount("/business/login?next=%2Fdash#top");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://business.epicmkt.co.ke/login?next=%2Fdash#top"));
  });

  it("sends /business to the seller root", async () => {
    getSiteConfig.mockResolvedValue({ seller_url: "https://business.epicmkt.co.ke" });
    const replace = mount("/business");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://business.epicmkt.co.ke"));
  });

  it("sends /admin/login to the admin address", async () => {
    getSiteConfig.mockResolvedValue({ admin_url: "https://admin.epicmkt.co.ke" });
    const replace = mount("/admin/login");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://admin.epicmkt.co.ke/login"));
  });

  it("waits for site_config before redirecting", async () => {
    let release;
    getSiteConfig.mockReturnValue(new Promise((r) => (release = r)));
    const replace = mount("/business/login");
    await new Promise((r) => setTimeout(r, 30));
    expect(replace).not.toHaveBeenCalled();
    release({ seller_url: "https://late.example" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://late.example/login"));
  });
});
