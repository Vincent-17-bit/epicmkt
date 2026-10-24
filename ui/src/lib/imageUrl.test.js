import { afterEach, describe, expect, it } from "vitest";
import { resizedUrl, setImageTransform, srcSetFor } from "./imageUrl.js";

const url = "https://x.supabase.co/storage/v1/object/public/seller-media/a/b.jpg";
afterEach(() => setImageTransform(false));

describe("imageUrl", () => {
  it("leaves urls untouched while transforms are off", () => {
    expect(resizedUrl(url, 480)).toBe(url);
    expect(srcSetFor(url)).toBeUndefined();
  });

  it("asks storage for a smaller copy when transforms are on", () => {
    setImageTransform(true);
    expect(resizedUrl(url, 400)).toBe("https://x.supabase.co/storage/v1/render/image/public/seller-media/a/b.jpg?width=480&quality=70&resize=cover");
    expect(srcSetFor(url)).toContain("width=1200&quality=70&resize=cover 1200w");
  });

  it("never rewrites blob, data or foreign urls", () => {
    setImageTransform(true);
    for (const other of ["blob:abc", "data:image/png;base64,AA", "https://cdn.example.com/p.jpg"]) expect(resizedUrl(other, 480)).toBe(other);
  });
});
