import { afterEach, describe, expect, it } from "vitest";
import { cloudinaryUrl } from "@epicmkt/shared";
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

  describe("Cloudinary pictures", () => {
    const id = "10000000-0000-0000-0000-0000000000a1/20000000-0000-0000-0000-0000000000c1/30000000-0000-0000-0000-0000000000d1";
    const cld = cloudinaryUrl("demo", id, 800);

    it("swaps the width without any flag, because Cloudinary always resizes", () => {
      expect(resizedUrl(cld, 240)).toBe(cloudinaryUrl("demo", id, 240));
      expect(resizedUrl(cld, 1000)).toBe(cloudinaryUrl("demo", id, 1200));
    });

    it("gives a srcset from small to large, each rung a different file", () => {
      const set = srcSetFor(cld);
      expect(set.split(", ")).toHaveLength(5);
      expect(set).toContain("w_240/");
      expect(set).toContain("w_1600/");
      expect(set).toMatch(/ 1600w$/);
    });

    it("keeps small pictures small: thumbnails use the eco quality tier", () => {
      expect(resizedUrl(cld, 160)).toContain("q_auto:eco");
      expect(resizedUrl(cld, 1600)).toContain("q_auto:best");
    });

    it("is unaffected by the Supabase transform flag", () => {
      setImageTransform(true);
      expect(resizedUrl(cld, 480)).toBe(cloudinaryUrl("demo", id, 480));
    });
  });
});
