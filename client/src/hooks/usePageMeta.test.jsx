import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageMeta } from "./usePageMeta.js";

const content = (selector, attr = "content") => document.head.querySelector(selector)?.getAttribute(attr) ?? null;

afterEach(() => {
  document.head.innerHTML = "";
});

describe("usePageMeta", () => {
  it("does nothing when given nothing", () => {
    renderHook(() => usePageMeta(undefined));
    expect(document.head.children).toHaveLength(0);
  });

  it("sets description, share image and canonical, creating tags that are missing", () => {
    document.title = "Skin fade | Fade Kings | EpicMKT";
    renderHook(() => usePageMeta({ description: "A clean skin fade.", image: "https://x/img.webp", path: "/b/fade-kings/i/skin" }));
    expect(content('meta[name="description"]')).toBe("A clean skin fade.");
    expect(content('meta[property="og:description"]')).toBe("A clean skin fade.");
    expect(content('meta[property="og:image"]')).toBe("https://x/img.webp");
    expect(content('meta[property="og:title"]')).toBe("Skin fade | Fade Kings | EpicMKT");
    expect(content('link[rel="canonical"]', "href")).toMatch(/\/b\/fade-kings\/i\/skin$/);
  });

  it("restores the previous values on unmount and removes tags it created", () => {
    document.head.innerHTML = '<meta name="description" content="site default" />';
    const { unmount } = renderHook(() => usePageMeta({ description: "Store text", path: "/b/x" }));
    expect(content('meta[name="description"]')).toBe("Store text");
    unmount();
    expect(content('meta[name="description"]')).toBe("site default");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("follows the page when the values change", () => {
    const { rerender } = renderHook((props) => usePageMeta(props), { initialProps: { description: "one", path: "/b/a" } });
    rerender({ description: "two", path: "/b/b" });
    expect(content('meta[name="description"]')).toBe("two");
    expect(content('link[rel="canonical"]', "href")).toMatch(/\/b\/b$/);
  });
});
