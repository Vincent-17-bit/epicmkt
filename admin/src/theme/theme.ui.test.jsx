import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { componentFiles, readAllStyles, readStyle } from "../styles/readStyles.js";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ThemeProvider } from "./ThemeProvider.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import { THEME_STORAGE_KEY, applySavedTheme } from "../lib/theme.js";

let listeners;
let dark;

function mockMatchMedia() {
  listeners = new Set();
  window.matchMedia = (query) => ({
    media: query,
    get matches() {
      return query.includes("dark") ? dark : false;
    },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  });
}
const setOsDark = (value) => {
  dark = value;
  act(() => listeners.forEach((fn) => fn({ matches: value })));
};
const theme = () => document.documentElement.getAttribute("data-theme");
const mountToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
      <ThemeToggle variant="menu" />
    </ThemeProvider>,
  );

beforeEach(() => {
  dark = false;
  mockMatchMedia();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
});
afterEach(cleanup);

describe("theme toggle", () => {
  it("cycles light -> dark -> system and flips data-theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    applySavedTheme();
    mountToggle();
    const [button] = screen.getAllByRole("button");
    expect(theme()).toBe("light");
    expect(button).toHaveTextContent("Light");
    fireEvent.click(button);
    expect(theme()).toBe("dark");
    expect(button).toHaveTextContent("Dark");
    fireEvent.click(button);
    expect(button).toHaveTextContent("System");
    expect(theme()).toBe("light");
  });

  it("header and menu toggles stay in step", () => {
    mountToggle();
    const [header, menu] = screen.getAllByRole("button");
    fireEvent.click(menu);
    expect(header.textContent).toBe(menu.textContent);
    expect(header.getAttribute("aria-label")).toBe(menu.getAttribute("aria-label"));
  });

  it("is not hidden on small screens", () => {
    mountToggle();
    for (const b of screen.getAllByRole("button")) expect(b.className).not.toContain("admin-wide-only");
  });
});

describe("persistence", () => {
  it("saves the mode and restores it on the next load", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    mountToggle();
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    cleanup();
    document.documentElement.removeAttribute("data-theme");
    applySavedTheme();
    expect(theme()).toBe("dark");
  });

  it("survives unreadable and unwritable storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => applySavedTheme()).not.toThrow();
    mountToggle();
    expect(() => fireEvent.click(screen.getAllByRole("button")[0])).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("ignores junk in storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    applySavedTheme();
    expect(theme()).toBe("light");
  });
});

describe("system mode", () => {
  it("follows the OS live and updates meta theme-color", () => {
    mountToggle();
    expect(theme()).toBe("light");
    setOsDark(true);
    expect(theme()).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#1a1a1a");
    setOsDark(false);
    expect(theme()).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#ffffff");
  });

  it("ignores OS changes when a mode is pinned", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    mountToggle();
    setOsDark(true);
    expect(theme()).toBe("light");
  });
});

describe("css", () => {
  const read = (f) => readFileSync(resolve(process.cwd(), "src/styles", f), "utf8");
  const rule = (css, selector) => {
    const m = css.match(new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : "";
  };

  it("sidebar uses sidebar tokens", () => {
    const css = readAllStyles();
    expect(rule(css, ".admin-sidebar")).toMatch(/background:\s*var\(--sidebar-bg\)/);
    expect(rule(css, ".admin-sidebar")).toMatch(/color:\s*var\(--sidebar-text\)/);
    expect(rule(css, ".admin-nav-item:hover")).toMatch(/var\(--sidebar-hover\)/);
    expect(rule(css, ".admin-nav-item.is-active")).toMatch(/var\(--sidebar-active\)/);
    expect(rule(css, ".admin-sidebar__brand-copy strong")).toMatch(/var\(--sidebar-text-active\)/);
  });

  it("defines every sidebar token for both themes", () => {
    const css = read("theme.css");
    const light = css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)[1];
    const darkBlock = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
    for (const t of ["bg", "text", "text-muted", "hover", "active", "border"]) {
      expect(light).toContain(`--sidebar-${t}:`);
      expect(darkBlock).toContain(`--sidebar-${t}:`);
    }
  });

  it("has no hard-coded colours outside theme.css", () => {
    for (const f of componentFiles()) {
      expect(readStyle(f).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) || [], f).toEqual([]);
    }
  });
});
