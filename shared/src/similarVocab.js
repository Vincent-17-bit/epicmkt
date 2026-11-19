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
  "men", "mens", "women", "womens", "ladies", "lady", "kids", "kid", "boys", "boy", "girls", "girl", "unisex", "adult", "child", "children",
  "per", "each", "only", "bulk", "wholesale", "retail", "full", "monthly", "daily", "weekly", "hourly", "hour", "day", "night", "month", "session",
  "people", "persons", "guests", "seater", "bedroom", "bunch", "refill", "tier", "tray", "crate", "sack", "tonne", "trip",
  "pro", "max", "plus", "ultra", "lite",
  "chocolate", "vanilla", "strawberry"
];

// Words that are real product names even though they are shorter than three letters.
export const SHORT_NOUNS = ["tv", "pc"];

// The same thing under different names. The FIRST word of a group is the one the others fold into.
export const SYNONYM_GROUPS = [
  ["soda", "coke", "coca", "cola", "fanta", "sprite", "pepsi", "mirinda", "krest", "stoney", "novida"],
  ["tea", "chai"],
  ["haircut", "cut", "trim"],
  ["fertilizer", "fertiliser", "dap", "npk", "urea"],
  ["diaper", "nappy", "pamper"],
  ["lorry", "truck"],
  ["bread", "loaf"],
  ["sofa", "couch", "settee"],
  ["phone", "mobile", "smartphone", "cellphone", "iphone", "galaxy", "tecno", "infinix", "redmi", "oppo", "itel", "nokia", "pixel", "xiaomi", "realme", "camon", "spark"],
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
  "tilapia", "omena", "mince", "goat", "mutton", "pork", "liver", "kale", "cabbage", "spinach", "carrot", "capsicum", "garlic", "ginger", "pineapple", "watermelon", "lemon", "cassava", "matoke", "ugali", "pilau", "biryani", "curry", "nyamachoma", "muffin", "doughnut", "scone", "bun", "sauce", "ketchup", "oat", "porridge", "weetabix", "cornflake", "spaghetti", "macaroni",
  "capsule", "syrup", "thermometer", "bandage", "plaster", "vitamin", "pad", "diaper", "wipe", "formula", "glucometer", "nebulizer",
  "padlock", "lock", "hinge", "spanner", "plier", "screwdriver", "saw", "spade", "panga", "jembe", "wheelbarrow", "cement", "ballast", "sand", "nail", "screw", "bolt", "timber", "paint", "brush", "pipe", "tap", "tank", "socket", "switch", "wire", "bulb", "breaker", "tyre", "tire", "sparkplug", "filter", "helmet", "steelbar", "lpg", "gashose", "regulator", "burner", "pvcpipe", "engineoil", "cookingoil", "dispenser",
  "feed", "seed", "seedling", "fertilizer", "pesticide", "sprayer", "dewormer", "chick", "hay",
  "tv", "fridge", "washer", "inverter", "generator", "solarpanel", "lantern", "stove", "cooker", "oven", "dishwasher", "freezer",
  "wardrobe", "sofa", "rug", "stool", "cot", "stroller", "mop", "detergent", "disinfectant",
  "uniform", "shuka", "gown", "jersey", "book", "pen", "pencil", "marker", "ruler", "novel", "bible", "bicycle", "motorbike",
  "haircut", "shave", "massage", "manicure", "pedicure", "braid", "weave", "facial", "laundry", "tailoring", "plumbing", "photography", "tuition", "hotel", "airtime",
  "cake", "cupcake", "biscuit", "milk", "yogurt", "butter", "cheese", "egg", "rice", "flour", "sugar", "salt", "oil", "tea", "coffee", "juice", "water", "soda",
  "meat", "beef", "chicken", "fish", "sausage", "pizza", "burger", "chip", "samosa", "mandazi", "chapati", "maize", "bean", "tomato", "onion", "potato", "banana",
  "apple", "mango", "avocado", "honey", "jam", "cereal", "noodle", "pasta", "icecream",
  "table", "chair", "bed", "mattress", "shelf", "desk", "lamp", "curtain", "carpet", "pillow", "blanket", "sheet", "towel", "mirror", "cabinet", "door",
  "laptop", "tablet", "radio", "speaker", "headphone", "charger", "cable", "microwave", "kettle", "blender", "iron", "fan", "heater", "printer", "router", "camera", "battery",
  "phonecase", "screenprotector", "powerbank", "memorycard", "flashdrive",
  "shirt", "tshirt", "jean", "trouser", "dress", "skirt", "jacket", "coat", "shoe", "sandal", "boot", "sock", "hat", "cap", "belt", "bag", "handbag", "backpack", "watch", "wallet", "suit", "scarf",
  "shampoo", "soap", "lotion", "cream", "perfume", "lipstick", "deodorant",
  "knife", "spoon", "fork", "plate", "cup", "bottle", "pot", "pan", "bucket", "broom", "hammer", "drill"
];

// Two-word names that are one thing, joined before splitting: "T-Shirt" -> "tshirt". Several names can join into the same thing
// ("phone cover" and "back cover" are a phone case). Phone accessories are here because their last word alone says too little:
// "case" is also a pencil case and "protector" a surge protector, so the plain words stay unknown while the full names are known
// and told apart (a screen protector is never "similar" to a phone case, even in a shared "Cases and protectors" section).
export const COMPOUNDS = {
  "gas hose pipe": "gashose", "gas cylinder": "lpg", "gas refill": "lpg", "cooking gas": "lpg", "lpg gas": "lpg", "gas cooker": "cooker", "gas stove": "stove", "gas hose": "gashose", "hose pipe": "gashose", "gas pipe": "gashose", "gas regulator": "regulator",
  "pvc pipe": "pvcpipe", "ppr pipe": "pvcpipe", "engine oil": "engineoil", "motor oil": "engineoil", "cooking oil": "cookingoil", "vegetable oil": "cookingoil",
  "sukuma wiki": "kale", "tea leaves": "tea", "tea bags": "tea", "tea masala": "tea", "washing powder": "detergent", "laundry soap": "detergent",
  "mineral water": "water", "drinking water": "water", "bottled water": "water", "water refill": "waterrefill",
  "spark plug": "sparkplug", "brake pad": "brakepad", "steel bar": "steelbar", "binding wire": "bindingwire", "welding rod": "weldingrod",
  "solar panel": "solarpanel", "washing machine": "washer", "car battery": "carbattery", "oil filter": "oilfilter", "air filter": "oilfilter",
  "hair cut": "haircut", "shoe polish": "shoepolish", "shoe repair": "shoerepair", "car wash": "carwash", "dry cleaning": "dryclean",
  "t shirt": "tshirt", "ice cream": "icecream", "hand bag": "handbag", "cell phone": "cellphone",
  "phone case": "phonecase", "phone cover": "phonecase", "back cover": "phonecase", "flip cover": "phonecase",
  "screen protector": "screenprotector", "screen guard": "screenprotector", "tempered glass": "screenprotector",
  "power bank": "powerbank",
  "memory card": "memorycard", "sd card": "memorycard", "micro sd": "memorycard",
  "flash disk": "flashdrive", "flash drive": "flashdrive", "usb drive": "flashdrive"
};

// Plurals the simple rules get wrong. Maps the plural to its singular.
export const IRREGULAR_PLURALS = {
  loaves: "loaf", knives: "knife", shelves: "shelf", leaves: "leaf", feet: "foot", children: "child", mice: "mouse",
  potatoes: "potato", tomatoes: "tomato", mangoes: "mango", avocadoes: "avocado"
};

// Words that end in "s" but are already singular.
export const INVARIANT_WORDS = ["lens", "series", "news", "species", "gas", "bus", "plus"];

// Words that fill or flavour a food named before them ("Samosa beef" is a samosa, "Pizza chicken" is a pizza): they are not the kind
// when a known product comes earlier in the name.
export const FILLING_WORDS = ["beef", "chicken", "cheese", "tuna", "mutton", "pork", "egg", "vegetable", "veg", "sausage"];
