import { describe, expect, it } from "vitest";
import { SIZES, TAGLINE, buildMatrix, fitText, posterFileName, posterStyle, wrapLines } from "./poster.js";

const ctx = () => ({ font: "", measureText(t) { const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10); return { width: t.length * px * 0.5 }; } });

describe("poster helpers", () => {
  it("keeps the agreed tagline and paper sizes", () => {
    expect(TAGLINE).toBe("Scan to see our prices and location");
    expect(Object.keys(SIZES)).toEqual(["a4", "a5"]);
    expect(SIZES.a4.mm).toEqual([210, 297]);
    expect(SIZES.a5.mm).toEqual([148, 210]);
  });

  it("is plain on Standard and fully branded on Premium", () => {
    expect(posterStyle("standard")).toBe("plain");
    expect(posterStyle("premium")).toBe("branded");
    expect(posterStyle(undefined)).toBe("plain");
  });

  it("wraps on words and shrinks long names before it cuts them", () => {
    const m = (t) => t.length * 10;
    expect(wrapLines(m, "aaa bbb ccc", 70)).toEqual(["aaa bbb", "ccc"]);
    const fit = fitText(ctx(), "Kisumu Fresh Produce Wholesale", { maxWidth: 400, startPx: 90, minPx: 30, maxLines: 2 });
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.px).toBeLessThan(90);
    const cut = fitText(ctx(), "x".repeat(200), { maxWidth: 200, startPx: 60, minPx: 40, maxLines: 2 });
    expect(cut.lines.at(-1).endsWith("…")).toBe(true);
  });

  it("encodes the public link only, and a different one for every business", async () => {
    const a = await buildMatrix("shop-a");
    const b = await buildMatrix("shop-b");
    expect(a.text).toBe("https://epicmkt.app/s/shop-a?src=qr");
    expect(b.text).toBe("https://epicmkt.app/s/shop-b?src=qr");
    const bits = (m) => Array.from({ length: m.size }, (_, r) => Array.from({ length: m.size }, (_, c) => (m.dark(r, c) ? 1 : 0)).join("")).join("");
    expect(bits(a)).not.toBe(bits(b));
    await expect(buildMatrix("Bad Slug?x=1")).rejects.toThrow("invalid_slug");
  });

  it("names files by slug and size", () => {
    expect(posterFileName("shop-a", "a5", "pdf")).toBe("epicmkt-qr-shop-a-a5.pdf");
  });
});

describe("one code per business, on every screen", () => {
  it("poster, seller preview and customer page build identical modules; only the plan's logo room changes the pattern", async () => {
    const { default: QR } = await import("qrcode");
    const { shopQrSpec } = await import("@epicmkt/shared");
    const bitsOf = (m) => Array.from({ length: m.size }, (_, r) => Array.from({ length: m.size }, (_, c) => (m.dark(r, c) ? 1 : 0)).join("")).join("");
    const clientBits = (spec) => {
      const { modules } = QR.create(spec.text, { errorCorrectionLevel: spec.ecl });
      return bitsOf({ size: modules.size, dark: (r, c) => modules.get(r, c) });
    };
    for (const planKey of ["standard", "premium"]) {
      for (const hasLogo of [true, false]) {
        const poster = await buildMatrix("shop-a", { planKey, hasLogo });
        expect(bitsOf(poster)).toBe(clientBits(shopQrSpec("shop-a", { planKey, hasLogo })));
      }
    }
    const std = await buildMatrix("shop-a", { planKey: "standard", hasLogo: true });
    const prem = await buildMatrix("shop-a", { planKey: "premium", hasLogo: true });
    expect(std.text).toBe(prem.text);
  });
});
