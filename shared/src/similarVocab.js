// The vocabulary behind "Similar items". Pure data, so it can grow without touching the ranking logic, and
// similarVocab.test.js checks it stays consistent. Everything is lowercase, one word per entry, and written in the
// SINGULAR ("trouser", not "trousers"): plurals are folded automatically (see `singular` in similar.js).

// Words that say nothing about what a product is. Packaging words come here so "Pack of 6 eggs" is about eggs.
export const STOP_WORDS = [
  "the", "and", "for", "with", "from", "your", "our", "best", "new", "size",
  "item", "product", "service", "other", "misc",
  "pack", "packet", "pcs", "set", "pair", "piece", "dozen", "bundle", "combo", "lot",
  "gen", "generation"
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
  // Phone brands and model lines say "phone" on their own: a name ending in one of them is a phone ("Samsung Galaxy A15", "Itel A60").
  ["phone", "mobile", "smartphone", "cellphone", "iphone", "galaxy", "itel", "tecno", "infinix", "redmi", "xiaomi", "oppo", "huawei", "nokia", "realme", "vivo", "oneplus", "pixel"],
  ["tablet", "ipad"],
  ["laptop", "macbook", "chromebook", "thinkpad", "latitude", "inspiron", "pavilion", "ideapad", "probook", "elitebook", "vostro"],
  ["headphone", "earphone", "earbud", "headset", "airpod"],
  ["printer", "laserjet", "inkjet", "deskjet", "ecotank", "pixma"],
  ["paper", "ream"],
  ["tv", "television"],
  ["fridge", "refrigerator"],
  ["sneaker", "trainer"],
  ["cooker", "stove"],
  ["wardrobe", "closet"],
  ["torch", "flashlight"],
  ["sweater", "jumper", "pullover"],
  ["lens", "lense"],
  // Fizzy drinks by brand: a shopper looking at a Coca-Cola will take a Fanta or a Sprite
  ["soda", "pepsi", "mirinda", "krest", "stoney", "novida", "coke"],
  ["beer", "guinness", "tusker", "stout"],
  ["paint", "emulsion"],
  ["tank", "kentank"]
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
  ["laptop", "pc"],
  ["speaker", "soundbar", "hometheatre"],
  ["necklace", "bracelet", "earring", "ring", "anklet"],
  ["lipstick", "foundation", "mascara", "eyeliner"],
  ["dress", "skirt", "blouse"],
  ["jacket", "coat", "blazer", "hoody"],
  ["fridge", "freezer"],
  ["whiskey", "gin", "vodka", "brandy", "rum"],
  ["beer", "cider"]
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
  "phonecase", "screenprotector", "powerbank", "memorycard", "flashdrive",
  "shirt", "tshirt", "jean", "trouser", "dress", "skirt", "jacket", "coat", "shoe", "sandal", "boot", "sock", "hat", "cap", "belt", "bag", "handbag", "backpack", "watch", "wallet", "suit", "scarf",
  "shampoo", "soap", "lotion", "cream", "perfume", "lipstick", "deodorant",
  "knife", "spoon", "fork", "plate", "cup", "bottle", "pot", "pan", "bucket", "broom", "hammer", "drill",
  // Fashion, beauty and jewellery
  "cardigan", "hoody", "tie", "blazer", "gown", "bra", "panty", "vest", "tight", "pyjama", "nightdress", "jersey", "tracksuit", "legging", "swimsuit", "glove", "purse",
  "necklace", "bracelet", "earring", "ring", "anklet", "sunglass", "wig", "foundation", "mascara", "eyeliner", "serum", "conditioner", "pomade", "clipper", "trimmer", "razor", "aftershave",
  "sunscreen", "balm", "eyelash", "sponge", "brush", "comb",
  // Phones, computers, power and electrical
  "mouse", "keyboard", "monitor", "toner", "cartridge", "soundbar", "hometheatre", "extender", "bulb", "chandelier", "calculator", "stapler", "scissor", "sellotape", "highlighter", "pencil", "notebook",
  "envelope", "folder", "stylus", "oven", "toaster", "dispenser", "dryer", "inverter", "panel", "alarm", "intercom", "detector", "projector",
  "socket", "switch", "breaker", "wire", "padlock", "lock", "hinge", "bolt", "hasp", "latch", "tank", "pipe", "timber", "plank", "tile", "cement", "paint", "mabati", "window", "fabric",
  "ladder", "toolbox", "spanner", "plier", "screwdriver", "saw", "grinder", "sandpaper", "putty", "sealant", "thinner", "roller",
  "regulator", "hose", "grill", "trolley", "jug", "lens", "gas",
  // Vehicles
  "tyre", "wiper", "filter", "plug", "headlight", "bumper", "rim", "radiator", "gearbox", "engine", "helmet", "motorbike", "sprocket",
  // Food and drink
  "bun", "pie", "scone", "cooky", "doughnut", "salad", "smoothy", "latte", "cappuccino", "milkshake", "smoky", "bacon", "ham", "biltong", "liver", "tripe", "kidney", "tongue", "steak", "mince", "rib",
  "tilapia", "tuna", "sardine", "prawn", "catfish", "omena", "spinach", "cabbage", "kale", "arrowroot", "ginger", "garlic", "chilli", "turmeric", "cardamom", "cinnamon", "coriander", "pepper",
  "lentil", "oat", "cocoa", "yoghurt", "ghee", "crisp", "popcorn", "nut", "gum", "cola", "fanta", "sprite", "spaghetti", "cornflake", "pilau", "curry", "githeri", "lactogen", "cerelac",
  "beer", "lager", "wine", "vodka", "gin", "whiskey", "cider", "cocktail", "mash", "tray", "crate",
  // Household, farm, pets, health, baby, sport
  "bleach", "disinfectant", "freshener", "insecticide", "pesticide", "herbicide", "candle", "match", "fertiliser", "sprayer", "pump", "jembe", "panga", "wheelbarrow", "feeder", "drinker",
  "brooder", "incubator", "cage", "collar", "leash", "bowl", "aquarium", "toy", "carrier", "syringe", "dewormer", "syrup", "capsule", "multivitamin", "thermometer", "glucometer", "oximeter", "nebuliser",
  "plaster", "bandage", "gauze", "mask", "tampon", "condom", "diaper", "wipe", "pacifier", "teether", "stroller", "cot", "playpen", "bouncer", "sterilizer", "wheelchair", "crutch",
  "football", "dumbbell", "barbell", "kettlebell", "treadmill", "textbook", "storybook", "novel", "bedsitter", "seedling", "turkey", "chick", "broiler", "mat", "rope", "chain", "bike", "shawl", "onesy",
  "net", "frame", "stereo", "stool", "bench", "ottoman",
  // Names that are one thing: see COMPOUNDS ("tea bag" is not a bag)
  "teabag", "laptopbag", "travelbag", "schoolbag"
];

// Two-word names that are one thing, joined before splitting: "T-Shirt" -> "tshirt". Several names can join into the same thing
// ("phone cover" and "back cover" are a phone case). Phone accessories are here because their last word alone says too little:
// "case" is also a pencil case and "protector" a surge protector, so the plain words stay unknown while the full names are known
// and told apart (a screen protector is never "similar" to a phone case, even in a shared "Cases and protectors" section).
export const COMPOUNDS = {
  "t shirt": "tshirt", "ice cream": "icecream", "hand bag": "handbag", "cell phone": "cellphone",
  "phone case": "phonecase", "phone cover": "phonecase", "back cover": "phonecase", "flip cover": "phonecase",
  "screen protector": "screenprotector", "screen guard": "screenprotector", "tempered glass": "screenprotector", "glass protector": "screenprotector", "hydrogel protector": "screenprotector", "privacy screen": "screenprotector", "lens protector": "screenprotector",
  "power bank": "powerbank",
  // Joined names that are not their last word: tea is not luggage, and a home theatre is not a theatre
  "tea bag": "teabag", "laptop bag": "laptopbag", "travel bag": "travelbag", "school bag": "schoolbag", "home theatre": "hometheatre", "home theater": "hometheatre",
  "memory card": "memorycard", "sd card": "memorycard", "micro sd": "memorycard",
  "flash disk": "flashdrive", "flash drive": "flashdrive", "usb drive": "flashdrive"
};

// Phrases that are an ordinary word under another name. They are read the same way as COMPOUNDS, but they are NOT a joined name: the
// word they stand for already exists ("tecno spark" is a "phone"), so they never decide how a kind is said to a visitor.
export const ALIAS_PHRASES = {
  // A bag that is not a bag: tea is not luggage
  "egg tray": "egg", "egg crate": "egg", "iron sheet": "mabati", "roofing sheet": "mabati", "box profile": "mabati",
  
  "tote bag": "handbag", "shoulder bag": "handbag", "clutch bag": "handbag",
  "body spray": "perfume", "eau de": "perfume",
  // Cooking gas is one thing whatever the seller calls it: cylinder, refill or just "6kg gas"
  "gas cylinder": "gas", "gas refill": "gas", "cooking gas": "gas", "lpg gas": "gas", "gas bottle": "gas",
  // Model lines whose last word is a common word: "Tecno Spark" (not a spark plug), "Redmi Note", "Galaxy Tab", "MacBook Air"
  "tecno spark": "phone", "tecno camon": "phone", "redmi note": "phone", "galaxy tab": "tablet", "galaxy watch": "watch", "galaxy bud": "earbud",
  "ipad air": "tablet", "ipad mini": "tablet", "ipad pro": "tablet", "macbook air": "laptop", "macbook pro": "laptop",
  "jbl flip": "speaker", "jbl charge": "speaker", "jbl go": "speaker", "jbl boombox": "speaker", "bose soundlink": "speaker",
  "air freshener": "freshener", "hair dryer": "dryer", "hair clipper": "clipper"
};

// Phone and laptop brands and model lines. Last in a name they say what the product FITS, not what it is ("Phone cover Samsung A15"),
// so the head noun is the word before them whenever there is one. A name that is only a brand ("Samsung Galaxy A15") keeps it.
export const DEVICE_BRANDS = [
  "samsung", "apple", "tecno", "infinix", "itel", "redmi", "xiaomi", "oppo", "huawei", "nokia", "realme", "vivo", "oneplus", "pixel", "iphone", "galaxy", "ipad", "macbook",
  "hp", "dell", "lenovo", "asus", "acer", "sony", "lg", "jbl", "bose", "oraimo", "anker"
];

// A bare "case", "cover" or "protector" is only a phone accessory when a phone brand sits next to it ("iPhone case", "Samsung A15
// cover"): alone it may be a pencil case or a surge protector. Without a brand the full compound names above decide.
export const DEVICE_ACCESSORY_HEADS = { case: "phonecase", cover: "phonecase", bumper: "phonecase", pouch: "phonecase", protector: "screenprotector", guard: "screenprotector" };

// Plurals the simple rules get wrong. Maps the plural to its singular.
export const IRREGULAR_PLURALS = {
  loaves: "loaf", knives: "knife", shelves: "shelf", leaves: "leaf", feet: "foot", children: "child", mice: "mouse",
  potatoes: "potato", tomatoes: "tomato", mangoes: "mango", avocadoes: "avocado"
};

// Words that end in "s" but are already singular.
export const INVARIANT_WORDS = ["lens", "series", "news", "species", "gas", "bus", "plus"];
