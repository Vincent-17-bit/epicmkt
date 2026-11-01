// The vocabulary behind "Similar items". Pure data, so it can grow without touching the ranking logic, and
// similarVocab.test.js checks it stays consistent. Everything is lowercase, one word per entry, and written in the
// SINGULAR ("trouser", not "trousers"): plurals are folded automatically (see `singular` in similar.js).

// Words that say nothing about what a product is. Packaging words come here so "Pack of 6 eggs" is about eggs.
export const STOP_WORDS = [
  "the", "and", "for", "with", "from", "your", "our", "best", "new", "size",
  "item", "product", "service", "other", "misc",
  "pack", "packet", "pcs", "set", "pair", "piece", "dozen", "bundle", "combo", "lot"
];

// Units and quantities ("400g", "2 litre", "x6") are dropped. Any word containing a digit is dropped as well.
export const UNIT_WORDS = ["kg", "gram", "kilogram", "mg", "ml", "litre", "liter", "ltr", "cl", "oz", "lb", "cm", "mm", "inch", "metre", "meter", "ft"];

// Words that describe a product but never say what it is, so they are not taken as the head noun when they come last
// ("Leather sofa black" is a sofa). They still count as modifiers.
export const NEVER_HEAD = [
  "black", "white", "brown", "red", "blue", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "silver", "gold", "golden", "beige", "navy", "maroon",
  "small", "medium", "large", "big", "mini", "jumbo", "regular", "extra", "giant", "tiny", "long", "short", "wide", "slim",
  "fresh", "organic", "original", "classic", "premium", "deluxe", "special", "genuine", "authentic", "quality", "assorted", "mixed", "natural",
  "hot", "cold", "sweet", "spicy", "salted", "unsalted", "sliced", "whole", "plain", "flavoured", "flavored", "diet", "light", "instant", "imported", "local",
  "handmade", "homemade", "used", "brand",
  "pro", "max", "plus", "ultra", "lite",
  "chocolate", "vanilla", "strawberry"
];

// Words that are real product names even though they are shorter than three letters.
export const SHORT_NOUNS = ["tv", "pc"];

// The same thing under different names. The FIRST word of a group is the one the others fold into.
export const SYNONYM_GROUPS = [
  ["bread", "loaf"],
  ["sofa", "couch", "settee"],
  ["phone", "mobile", "smartphone", "cellphone", "iphone"],
  ["tv", "television"],
  ["fridge", "refrigerator"],
  ["sneaker", "trainer"],
  ["cooker", "stove"],
  ["wardrobe", "closet"],
  ["torch", "flashlight"],
  ["sweater", "jumper", "pullover"]
];

// Different things of the same family. They only count as similar when the seller also put them in the same section,
// and they rank below the same product. Be stingy: a short row is better than a wrong one.
export const RELATED_GROUPS = [
  ["sofa", "armchair", "ottoman"],
  ["sneaker", "shoe", "sandal", "boot"],
  ["shirt", "tshirt", "blouse"],
  ["jean", "trouser"],
  ["table", "desk"],
  ["chair", "stool", "bench"],
  ["laptop", "pc"]
];

// Products the vocabulary knows, so two different ones are told apart even when they share a section or a modifier
// ("Chocolate cake" is not "Chocolate biscuit"). A name whose head is NOT here is "opaque" (a model name such as
// "Galaxy"): those fall back to the seller's section instead of being ruled out.
export const NOUNS = [
  "cake", "cupcake", "biscuit", "milk", "yogurt", "butter", "cheese", "egg", "rice", "flour", "sugar", "salt", "oil", "tea", "coffee", "juice", "water", "soda",
  "meat", "beef", "chicken", "fish", "sausage", "pizza", "burger", "chip", "samosa", "mandazi", "chapati", "maize", "bean", "tomato", "onion", "potato", "banana",
  "apple", "mango", "avocado", "honey", "jam", "cereal", "noodle", "pasta", "icecream",
  "table", "chair", "bed", "mattress", "shelf", "desk", "lamp", "curtain", "carpet", "pillow", "blanket", "sheet", "towel", "mirror", "cabinet", "door",
  "laptop", "tablet", "radio", "speaker", "headphone", "charger", "cable", "microwave", "kettle", "blender", "iron", "fan", "heater", "printer", "router", "camera", "battery",
  "shirt", "tshirt", "jean", "trouser", "dress", "skirt", "jacket", "coat", "shoe", "sandal", "boot", "sock", "hat", "cap", "belt", "bag", "handbag", "backpack", "watch", "wallet", "suit", "scarf",
  "shampoo", "soap", "lotion", "cream", "perfume", "lipstick", "deodorant",
  "knife", "spoon", "fork", "plate", "cup", "bottle", "pot", "pan", "bucket", "broom", "hammer", "drill"
];

// Two-word names that are one thing, joined before splitting: "T-Shirt" -> "tshirt".
export const COMPOUNDS = { "t shirt": "tshirt", "ice cream": "icecream", "hand bag": "handbag", "cell phone": "cellphone" };

// Plurals the simple rules get wrong. Maps the plural to its singular.
export const IRREGULAR_PLURALS = {
  loaves: "loaf", knives: "knife", shelves: "shelf", leaves: "leaf", feet: "foot", children: "child", mice: "mouse",
  potatoes: "potato", tomatoes: "tomato", mangoes: "mango", avocadoes: "avocado"
};

// Words that end in "s" but are already singular.
export const INVARIANT_WORDS = ["lens", "series", "news", "species", "gas", "bus", "plus"];
