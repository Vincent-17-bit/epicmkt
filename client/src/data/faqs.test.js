import { describe, expect, it } from "vitest";
import { allFaqs, faqGroups, popularFaqs, POPULAR_FAQ_IDS, pricingFaqs } from "./faqs.js";

// The seven questions the flat FAQ page had before it was grouped. None may be dropped.
const ORIGINAL = [
  "How do I buy from a business?",
  "How do I contact a business?",
  "What does Featured mean?",
  "What does Verified mean?",
  "Why does a business show as Closed?",
  "How can my business be listed?",
  "Is EpicMKT free to use?"
];

describe("faq data", () => {
  it("keeps every question the page had before", () => {
    const questions = allFaqs.map((f) => f.q);
    ORIGINAL.forEach((q) => expect(questions).toContain(q));
  });

  it("has unique ids and non-empty text", () => {
    const ids = allFaqs.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    allFaqs.forEach((f) => {
      expect(typeof f.q).toBe("string");
      expect(f.a.trim().length).toBeGreaterThan(0);
    });
  });

  it("groups the questions into the four sections", () => {
    expect(faqGroups.map((g) => g.title)).toEqual(["For shoppers", "For businesses", "Pricing and payment", "Safety and reports"]);
    faqGroups.forEach((g) => expect(g.items.length).toBeGreaterThan(0));
  });

  it("picks four popular questions that exist", () => {
    expect(POPULAR_FAQ_IDS).toHaveLength(4);
    expect(popularFaqs.every(Boolean)).toBe(true);
  });

  it("shares the pricing questions with the pricing page", () => {
    expect(pricingFaqs).toBe(faqGroups.find((g) => g.id === "pricing").items);
  });
});
