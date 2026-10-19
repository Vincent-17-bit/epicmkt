import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ItemCard as SharedCard } from "@epicmkt/ui";
import ItemCard from "./ItemCard.jsx";
import { t } from "../i18n/index.js";

const item = {
  id: "i1", name: "Fade cut", imageUrl: "https://example.test/a.webp", availability: "limited",
  pricing: { regularPrice: 500, salePrice: 400, savings: 100, discountPercent: 20, variants: [] },
};

describe("customer ItemCard", () => {
  it("is the shared card from @epicmkt/ui, so the seller portal shows the same markup", () => {
    const customer = render(<ItemCard item={item} />).container.querySelector("[data-card]");
    const shared = render(
      <SharedCard item={item} labels={{ was: t("item.was"), availability: (k) => t(`item.availability.${k}`) }} />,
    ).container.querySelector("[data-card]");
    expect(customer.outerHTML).toBe(shared.outerHTML);
    expect(customer).toMatchSnapshot();
  });
});
