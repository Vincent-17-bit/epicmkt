import { afterEach, describe, expect, it } from "vitest";
import { adminBusinessesUrl, clearAdminAccess, getAdminAccess, parseAdminHash, safeOrigin, setAdminAccess } from "./adminAccess.js";

afterEach(() => window.sessionStorage.clear());

describe("parseAdminHash", () => {
  it("reads the token, the business and the admin app from the address", () => {
    expect(parseAdminHash("#token_hash=abc&business=Sunrise%20Bakery&seller=ES1&admin=https%3A%2F%2Fadmin.test%2Fx")).toEqual({ tokenHash: "abc", business: "Sunrise Bakery", seller: "ES1", admin: "https://admin.test" });
  });
  it("is nothing without a token", () => {
    expect(parseAdminHash("")).toBeNull();
    expect(parseAdminHash("#business=X")).toBeNull();
  });
});

describe("safeOrigin", () => {
  it("keeps only a plain http(s) origin", () => {
    expect(safeOrigin("https://admin.test/path?q=1")).toBe("https://admin.test");
    expect(safeOrigin("javascript:alert(1)")).toBe("");
    expect(safeOrigin("not a url")).toBe("");
  });
});

describe("admin access for this tab", () => {
  it("is remembered for the tab, cleared on close, and only trusts a safe admin address", () => {
    expect(getAdminAccess()).toBeNull();
    setAdminAccess({ business: "Sunrise Bakery", seller: "ES1", admin: "https://admin.test" });
    expect(getAdminAccess()).toEqual({ business: "Sunrise Bakery", seller: "ES1", admin: "https://admin.test" });
    clearAdminAccess();
    expect(getAdminAccess()).toBeNull();
    setAdminAccess({ business: "X", admin: "javascript:alert(1)" });
    expect(getAdminAccess().admin).toBe("");
  });
  it("goes back to the admin Businesses list", () => {
    expect(adminBusinessesUrl("https://admin.test")).toBe("https://admin.test/admin/businesses");
    expect(adminBusinessesUrl("")).toBe("");
  });
});
