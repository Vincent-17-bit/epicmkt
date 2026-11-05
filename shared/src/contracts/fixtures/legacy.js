// The legacy item: no product type, no options, no tiers. It must look and behave exactly as items did before Contract v1.
export const legacy = () => ({
  id: "fx-legacy", productType: null, name: "Plain item with no options", brand: null, hue: 210, section: "General",
  description: "An item saved before product types and options existed. It has a price and nothing else to choose.",
  highlights: [], specs: [],
  price: 1500
});
