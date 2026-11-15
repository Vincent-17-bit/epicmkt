// Demo "goes with" relations for the Recommend section, between kinds of product (the search kinds stand in for product
// types in the demo, where items carry no type). Same shape as product_relations rows: { fromKind, fromId, toKind, toId, weight }.
const pair = (from, to, weight) => ({ fromKind: "type", fromId: from, toKind: "type", toId: to, weight, active: true });

export const DEMO_RELATIONS = [
  pair("speakers", "tvs", 8), pair("speakers", "headphones", 6), pair("speakers", "phone-accessories", 4),
  pair("tvs", "speakers", 10), pair("tvs", "computer-accessories", 3),
  pair("headphones", "phones", 5), pair("headphones", "speakers", 6),
  pair("phones", "phone-accessories", 10), pair("phones", "headphones", 8), pair("phones", "speakers", 3),
  pair("phone-accessories", "phones", 5), pair("phone-accessories", "headphones", 4),
  pair("laptops", "computer-accessories", 10), pair("laptops", "headphones", 4), pair("computer-accessories", "laptops", 6),
  pair("clothing", "shoes", 8), pair("clothing", "bags", 6), pair("clothing", "jewellery", 5),
  pair("shoes", "clothing", 6), pair("shoes", "bags", 6), pair("bags", "shoes", 6), pair("jewellery", "clothing", 4),
  pair("fragrance", "beauty", 6), pair("beauty", "fragrance", 6),
  pair("furniture", "kitchen", 4), pair("kitchen", "furniture", 3),
  pair("food", "water", 3), pair("water", "food", 3),
  pair("hardware", "lighting", 4), pair("lighting", "batteries", 4), pair("batteries", "lighting", 4)
];
