import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { canonicalPath, useRouteSeo } from "./useRouteSeo.js";

const get = (selector, attr = "content") => document.head.querySelector(selector)?.getAttribute(attr) ?? null;
const at = (path) => renderHook(() => useRouteSeo(), { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> });

afterEach(() => {
  document.head.innerHTML = "";
  document.title = "";
});

describe("canonicalPath", () => {
  it("drops trailing slashes and lowercases the case-insensitive pages", () => {
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("/about/")).toBe("/about");
    expect(canonicalPath("/Flash")).toBe("/flash");
    expect(canonicalPath("/b/Fade-Kings")).toBe("/b/Fade-Kings");
  });
});

describe("useRouteSeo", () => {
  it("gives each page its own canonical, never the homepage's", () => {
    at("/about");
    expect(get('link[rel="canonical"]', "href")).toMatch(/\/about$/);
    expect(get('meta[property="og:url"]')).toMatch(/\/about$/);
  });

  it("sets a description for a fixed page and restores the default on unmount", () => {
    document.head.innerHTML = '<meta name="description" content="site default" />';
    document.title = "About | EpicMKT";
    const { unmount } = at("/about");
    expect(get('meta[name="description"]')).toMatch(/directory of local businesses/);
    expect(get('meta[property="og:title"]')).toBe("About | EpicMKT");
    unmount();
    expect(get('meta[name="description"]')).toBe("site default");
  });

  it("marks search results and short links noindex", () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
    const { unmount } = at("/search");
    expect(get('meta[name="robots"]')).toBe("noindex, follow");
    unmount();
    expect(get('meta[name="robots"]')).toBe("index, follow");
    at("/s/abc123");
    expect(get('meta[name="robots"]')).toBe("noindex, follow");
  });

  it("leaves the homepage indexable", () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
    at("/");
    expect(get('meta[name="robots"]')).toBe("index, follow");
  });
});
