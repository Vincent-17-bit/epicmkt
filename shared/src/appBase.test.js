import { describe, expect, it } from "vitest";
import { joinUrl, normalizeBase, stripBase, viteBase, withBase } from "./appBase.js";

describe("appBase", () => {
  it("normalizes bases", () => {
    expect(normalizeBase("")).toBe("");
    expect(normalizeBase("/")).toBe("");
    expect(normalizeBase("business")).toBe("/business");
    expect(normalizeBase("/business/")).toBe("/business");
  });
  it("builds the vite base", () => {
    expect(viteBase("")).toBe("/");
    expect(viteBase("/business")).toBe("/business/");
  });
  it("prefixes paths", () => {
    expect(withBase("", "/login")).toBe("/login");
    expect(withBase("/business", "/login")).toBe("/business/login");
    expect(withBase("/business", "login")).toBe("/business/login");
    expect(withBase("/business")).toBe("/business/");
  });
  it("strips the base", () => {
    expect(stripBase("/business", "/business/login")).toBe("/login");
    expect(stripBase("/business", "/business")).toBe("/");
    expect(stripBase("", "/login")).toBe("/login");
  });
  it("joins urls", () => {
    expect(joinUrl("https://a.example/", "/login")).toBe("https://a.example/login");
    expect(joinUrl("https://a.example", "")).toBe("https://a.example");
  });
});
