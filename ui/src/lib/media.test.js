import { describe, expect, it } from "vitest";
import { cardBlurb, coverUrl, dedupeDescription, firstSentence, formatDuration, metaDescription, normalizeMedia, paragraphs } from "./media.js";

describe("normalizeMedia", () => {
  it("keeps media[] in the seller's order", () => {
    const media = [{ id: "a", kind: "video", url: "a.mp4" }, { id: "b", kind: "image", url: "b.jpg" }];
    expect(normalizeMedia({ media, images: [{ url: "x.jpg" }] }).map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("adapts images[] + videos[], photos first, and drops entries without a url", () => {
    const out = normalizeMedia({ images: [{ id: "i", url: "i.jpg" }, { id: "bad" }], videos: [{ id: "v", url: "v.mp4" }] });
    expect(out.map((m) => [m.id, m.kind])).toEqual([["i", "image"], ["v", "video"]]);
  });
  it("never throws on junk", () => {
    expect(normalizeMedia(null)).toEqual([]);
    expect(normalizeMedia({ media: [null, {}] })).toEqual([]);
  });
});

describe("coverUrl", () => {
  it("is the first photo, never a video, even when a video comes first", () => {
    expect(coverUrl({ media: [{ id: "v", kind: "video", url: "v.mp4", poster: "p.jpg" }, { id: "i", kind: "image", url: "i.jpg" }] })).toBe("i.jpg");
  });
  it("falls back to imageUrl for list payloads, and null when there is nothing", () => {
    expect(coverUrl({ imageUrl: "list.jpg" })).toBe("list.jpg");
    expect(coverUrl({ videos: [{ url: "v.mp4" }] })).toBeNull();
  });
});

describe("card blurb", () => {
  it("prefers the short description", () => {
    expect(cardBlurb({ shortDescription: " Light  and fast ", description: "Other. Words." })).toBe("Light and fast");
  });
  it("falls back to the first sentence of the description", () => {
    expect(cardBlurb({ shortDescription: "", description: "Sharp steel blade.  Comes boxed. Two year warranty." })).toBe("Sharp steel blade.");
  });
  it("does not cut at an abbreviation followed by a number", () => {
    expect(firstSentence("Weighs approx. 5 kg. Folds flat.")).toBe("Weighs approx. 5 kg.");
  });
  it("is empty when there is nothing to say", () => {
    expect(cardBlurb({})).toBe("");
  });
});

describe("descriptions", () => {
  it("uses the short description for meta, falling back to the description, clipped", () => {
    expect(metaDescription({ shortDescription: "Short", description: "Long" })).toBe("Short");
    expect(metaDescription({ description: "Long" })).toBe("Long");
    expect(metaDescription({ description: "x".repeat(300) })).toHaveLength(160);
  });
  it("does not repeat the short description at the start of the full one", () => {
    expect(dedupeDescription("Sharp steel blade.", "Sharp steel blade.\n\nComes boxed.\nTwo year warranty.")).toBe("Comes boxed.\nTwo year warranty.");
  });
  it("hides a full description that only repeats the short one, and keeps different ones", () => {
    expect(dedupeDescription("Same words", "same  words")).toBe("");
    expect(dedupeDescription("Short", "Something else entirely")).toBe("Something else entirely");
  });
  it("splits paragraphs on blank lines only", () => {
    expect(paragraphs("One\nstill one\n\nTwo\n \nThree")).toEqual(["One\nstill one", "Two", "Three"]);
  });
  it("formats durations", () => {
    expect([formatDuration(83), formatDuration(3725), formatDuration(0), formatDuration("x")]).toEqual(["1:23", "1:02:05", "", ""]);
  });
});
