import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signedInApp } from "../../test/utils.jsx";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");
const sharedTokens = readFileSync(join(root, "..", "ui", "src", "styles", "tokens.css"), "utf8");
const sellerCss = read("src/styles/seller.css");

const cssFiles = [];
const walk = (dir) => {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name));
    else if (e.name.endsWith(".css")) cssFiles.push(join(dir, e.name));
  }
};
walk("src");

const block = (css, selector) => {
  const start = css.indexOf(selector);
  return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
};

describe("themes", () => {
  it("every colour variable the seller screens use exists in both themes", () => {
    const light = block(sharedTokens, ':root,\n[data-theme="light"]') + block(sellerCss, ':root,\n[data-theme="light"]');
    const dark = block(sharedTokens, '[data-theme="dark"]') + block(sellerCss, '[data-theme="dark"]');
    const rootVars = block(sharedTokens, ":root {");
    const used = new Set();
    for (const f of cssFiles) for (const m of read(f).matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1]);
    // Layout hooks a caller may set; each is read with a built-in fallback, so it is not a theme token.
    const OPTIONAL_HOOKS = new Set(["--view-as-height"]);
    const missing = [];
    for (const v of used) {
      if (OPTIONAL_HOOKS.has(v)) continue;
      const inRoot = rootVars.includes(`${v}:`);
      if (!inRoot && !(light.includes(`${v}:`) && dark.includes(`${v}:`))) missing.push(v);
    }
    expect(missing).toEqual([]);
  });

  it("the status colours are defined for light and dark", () => {
    for (const tone of ["ok", "warn", "danger", "info"]) {
      for (const part of ["bg", "text", "border"]) {
        expect(block(sellerCss, ':root,\n[data-theme="light"]')).toContain(`--${tone}-${part}:`);
        expect(block(sellerCss, '[data-theme="dark"]')).toContain(`--${tone}-${part}:`);
      }
    }
  });

  it("switches theme, remembers it and exposes the state", async () => {
    const user = userEvent.setup();
    await signedInApp();
    const btn = await screen.findByRole("button", { name: "Dark theme" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await user.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("seller-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("no seller stylesheet hard-codes a colour outside the print rules", () => {
    for (const f of cssFiles.filter((x) => !x.endsWith("seller.css"))) {
      const css = read(f).replace(/@media print[\s\S]*$/m, "");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });
});

describe("responsive", () => {
  it("the page is mobile-ready: viewport, safe areas, tap targets", () => {
    const html = read("index.html");
    expect(html).toContain("width=device-width");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('name="color-scheme"');
    expect(sharedTokens).toContain("--tap: 44px");
    expect(read("src/styles/ui.module.css")).toMatch(/\.btn\s*{[^}]*min-height:\s*var\(--tap\)/);
  });

  it("the payment history becomes stacked cards under 40rem", () => {
    const css = read("src/pages/business/subscription.module.css");
    const small = css.slice(css.indexOf("@media (max-width: 40rem)"));
    expect(small).toMatch(/\.table tr\s*{[^}]*border/);
    expect(small).toMatch(/\.table td::before\s*{[^}]*attr\(data-label\)/);
    expect(small).toMatch(/\.table thead\s*{[^}]*position:\s*absolute/);
    expect(small).toMatch(/\.compare\s*{[^}]*grid-template-columns:\s*1fr/);
    expect(small).toMatch(/\.pay > div\s*{[^}]*grid-template-columns:\s*1fr/);
  });

  it("the navigation is a bottom bar on phones and a sidebar from 48rem, and wide content never scrolls the page", () => {
    const layout = read("src/components/Layout.module.css");
    expect(layout).toMatch(/\.nav\s*{[^}]*position:\s*fixed[^}]*bottom:\s*0/);
    expect(layout).toMatch(/@media \(min-width: 48rem\)[\s\S]*\.nav\s*{[^}]*position:\s*static/);
    expect(layout).toMatch(/@media \(max-width: 19.99rem\)/);
    expect(read("src/pages/business/subscription.module.css")).toMatch(/\.tableWrap\s*{[^}]*overflow-x:\s*auto/);
    expect(read("src/styles/ui.module.css")).toMatch(/\.card\s*{[^}]*min-width:\s*0/);
  });

  it("long text wraps instead of overflowing", () => {
    expect(read("src/pages/business/questions.module.css")).toContain("overflow-wrap: anywhere");
    expect(read("src/pages/business/subscription.module.css")).toContain("overflow-wrap: anywhere");
  });
});
