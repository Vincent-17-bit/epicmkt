import { describe, expect, it } from "vitest";
import { readSuggestion, suggestionPath } from "./suggestion.js";

describe("suggestion links carry the category the admin set up", () => {
  it("a category from the database list travels by name, even one the built-in list does not know", () => {
    const path = suggestionPath({ name: "Mama Njeri Cakes", category: "custom-bakes", categoryName: "Cakes and pastries", town: "Thika" });
    expect(suggestionPath({ name: "X", category: "bad", categoryName: "<script>" })).toBe("/contact?suggest=X");
    const params = new URLSearchParams(path.split("?")[1]);
    expect(params.get("category")).toBe("Cakes and pastries");
    expect(readSuggestion(params).note).toBe('Please add "Mama Njeri Cakes" to EpicMKT. Category: Cakes and pastries. Town: Thika.');
  });

  it("older links that carry a built-in id still read as its name", () => {
    const params = new URLSearchParams("suggest=Joy+Bakers&category=bakery");
    expect(readSuggestion(params).note).toBe('Please add "Joy Bakers" to EpicMKT. Category: Bakery.');
  });
});
