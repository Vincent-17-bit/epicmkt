import { describe, it, expect } from "vitest";
import { errorText } from "./errors.js";

describe("errorText names real save failures", () => {
  it("blames the connection only for a network failure", () => {
    expect(errorText({ code: "TypeError", message: "TypeError: Failed to fetch" })).toMatch(/check your connection/i);
    expect(errorText(null)).toMatch(/check your connection/i);
  });
  it("maps product type and option codes", () => {
    expect(errorText({ code: "unknown_product_type" })).toMatch(/no longer available/i);
  });
  it("says when the database is missing an update, and names an unknown code", () => {
    expect(errorText({ code: "Could not find the function public.seller_set_item_size_guide(p_id, p_guide) in the schema cache", message: "Could not find the function" })).toMatch(/database update/i);
    expect(errorText({ code: "weird_code", message: "weird_code" })).toContain("weird_code");
    expect(errorText({ code: "weird_code" }, "mine")).toBe("mine");
  });
});
