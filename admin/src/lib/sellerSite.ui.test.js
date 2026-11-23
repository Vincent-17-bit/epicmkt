import { describe, expect, it } from "vitest";
import { sellerSiteBase, sellerSiteLink } from "./sellerSite.js";

describe("sellerSiteBase", () => {
  it("uses VITE_SELLER_URL when it is set, without a trailing slash", () => {
    expect(sellerSiteBase({ VITE_SELLER_URL: "https://seller.epicmkt.co.ke/" }, { hostname: "admin.epicmkt.co.ke", protocol: "https:", port: "" })).toBe("https://seller.epicmkt.co.ke");
  });
  it("works the seller address out from the admin one", () => {
    expect(sellerSiteBase({}, { hostname: "epicmkt-admin.vercel.app", protocol: "https:", port: "" })).toBe("https://epicmkt-seller.vercel.app");
    expect(sellerSiteBase({}, { hostname: "admin.epicmkt.co.ke", protocol: "https:", port: "8443" })).toBe("https://seller.epicmkt.co.ke:8443");
  });
  it("falls back to the local seller app", () => {
    expect(sellerSiteBase({}, { hostname: "localhost", protocol: "http:", port: "5173" })).toBe("http://localhost:5174");
  });
});

describe("sellerSiteLink", () => {
  it("puts the token after the #, so no server ever receives it", () => {
    const link = sellerSiteLink({ base: "https://seller.test", tokenHash: "abc123", businessName: "Sunrise Bakery", sellerId: "ES777001", adminUrl: "https://admin.test" });
    expect(link.startsWith("https://seller.test/admin-access#")).toBe(true);
    expect(link.includes("?")).toBe(false);
    const q = new URLSearchParams(link.split("#")[1]);
    expect([q.get("token_hash"), q.get("business"), q.get("seller"), q.get("admin")]).toEqual(["abc123", "Sunrise Bakery", "ES777001", "https://admin.test"]);
  });
});
