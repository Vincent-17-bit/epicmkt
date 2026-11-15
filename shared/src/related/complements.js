// What goes with what ("Goes well with this"). Pure data and two small functions, shared by the demo backend and the live adapter.
//
// "Similar" and "goes with" are different questions. Pilau at one cafe is SIMILAR to pilau at another (same kind of thing, a
// different shop). A soda or a mango juice GOES WITH pilau (a different kind of thing you buy with it). So a complement is never
// the same group as the item, and an item whose group has no partners (a haircut, a medicine) has nothing that goes with it: the
// section is simply not shown.
//
// Every item gets one group: from its words first, because a name is the most specific thing we have ("Gas regulator" is a gas
// accessory even if the seller filed it under cooking gas), then from its product type. Groups are mostly the seeded product
// type ids, plus a few finer ones the types do not have (soda, spreads, gas accessories, bedding...).
//
// Admin relations (product_relations, the Relations page) still apply on top of this map: they can add pairs the map does not know.

// [group, phrases]. Matched on whole words, lower case. Order matters only between groups that share a word: the more specific
// group comes first (a "phone case" is a case, not a phone; a "laptop bag" is a bag, not a laptop).
const PHRASES = [
  // accessories before the things they go with
  ["gas-cooker", ["gas cooker", "gas stove", "cooker hob", "table top cooker"]],
  ["gas-accessory", ["gas regulator", "regulator", "gas hose", "hose pipe", "gas pipe", "gas burner", "burner with grill", "grill top", "meko", "gas grill"]],
  ["lpg-gas", ["gas cylinder", "cooking gas", "lpg", "gas refill", "k gas", "kgas", "pro gas", "progas", "total gas", "hashi gas", "6kg gas", "13kg gas"]],
  ["phone-case", ["phone case", "phone cover", "back cover", "flip cover", "silicone case"]],
  ["screen-protector", ["screen protector", "tempered glass", "screen guard"]],
  ["extension-multi-plug", ["extension cable", "extension socket", "extension", "multi plug", "multiplug", "power strip", "surge protector"]],
  ["phone-charger", ["phone charger", "fast charger", "charging cable", "usb c cable", "type c cable", "lightning cable", "charger"]],
  ["power-bank", ["power bank", "powerbank"]],
  ["earphones-headphones", ["earphones", "earbuds", "buds", "headphones", "headset", "airpods"]],
  ["memory-card", ["memory card", "microsd", "micro sd", "sd card", "flash disk", "flash drive", "usb drive"]],
  ["laptop-charger", ["laptop charger"]],
  ["mouse-keyboard", ["mouse", "keyboard"]],
  ["backpack-travel-bag", ["laptop bag", "backpack", "travel bag"]],
  ["ink-toner", ["ink", "toner", "cartridge"]],
  ["paper-reams", ["paper ream", "a4 paper", "printing paper", "photocopy paper"]],
  ["tv-mount", ["tv bracket", "wall bracket", "wall mount", "tv mount", "tv stand"]],
  // Things that never pair with anything are still recognised, before the products, so their words cannot fall through to another
  // group ("Phone repair" is a service, not a phone; "Maize meal" is flour, not a restaurant meal; "Toilet rolls" are not bread).
  ["services", ["sugar test", "blood sugar", "blood pressure", "pressure check", "test", "check-up", "checkup", "screening", "haircut", "hair cut", "fade", "shave", "braids", "manicure", "pedicure", "massage", "repair", "service", "wash", "consultation", "membership", "session", "tailoring", "alteration", "printing", "photocopy", "typing", "lamination", "delivery fee"]],
  ["medicine", ["tablets", "capsules", "syrup", "paracetamol", "panadol", "antibiotic", "medicine", "ointment", "injection"]],
  ["liquor", ["whisky", "whiskey", "vodka", "gin", "beer", "wine", "brandy", "rum", "liquor", "tusker", "guinness"]],
  ["staples", ["maize flour", "maize meal", "unga", "wheat flour", "cooking oil", "rice 1kg", "rice 2kg", "rice 5kg", "salt", "beans 1kg"]],
  ["household", ["toilet paper", "toilet rolls", "tissue", "serviette", "detergent", "bar soap", "washing powder", "bleach"]],
  ["speaker-soundbar", ["soundbar", "sound bar", "speaker", "subwoofer", "home theatre", "home theater"]],
  ["tv", ["smart tv", "tv", "television"]],
  ["phone", ["smartphone", "iphone", "galaxy", "tecno", "infinix", "redmi", "oppo", "itel", "nokia", "phone"]],
  ["laptop", ["laptop", "notebook pc", "macbook", "chromebook"]],
  ["printer", ["printer"]],
  ["router-extender", ["router", "wifi extender", "mifi"]],
  // food and drink
  ["bread", ["bread", "loaf", "buns", "rolls"]],
  ["cupcakes-pastries", ["cupcake", "cupcakes", "muffin", "doughnut", "donut", "croissant", "mandazi", "samosa", "cookie", "cookies", "biscuit", "biscuits", "scone"]],
  ["cake", ["cake"]],
  ["restaurant-meal", ["butter chicken", "chicken curry", "beef curry", "curry", "masala", "pilau", "pilaf", "biryani", "chips", "fries", "burger", "pizza", "shawarma", "chapati", "ugali", "nyama choma", "fried rice", "rice and", "stew", "fish fillet", "chicken quarter", "wings", "sandwich", "matoke", "githeri", "mukimo", "samaki wa", "plate", "meal", "lunch", "breakfast special"]],
  ["soft-drink", ["soda", "coca cola", "coca-cola", "coke", "fanta", "sprite", "pepsi", "mirinda", "krest", "stoney", "novida", "soft drink", "energy drink", "redbull", "red bull", "minute maid", "afia"]],
  ["juice", ["juice", "smoothie", "milkshake", "lemonade"]],
  ["drinking-water", ["mineral water", "drinking water", "bottled water", "dasani", "keringet", "aquamist", "water 500ml", "water 1l", "water 1.5l"]],
  ["tea-coffee", ["tea leaves", "tea bags", "ketepa", "kericho gold", "coffee", "nescafe", "cocoa", "drinking chocolate"]],
  ["milk", ["fresh milk", "milk", "yoghurt", "yogurt", "mala", "lala"]],
  ["spreads", ["blue band", "margarine", "butter", "jam", "peanut butter", "honey", "nutella"]],
  ["sugar", ["sugar"]],
  // home
  ["bedding", ["bedsheet", "bed sheet", "duvet", "pillow", "blanket", "mattress protector", "bedspread"]],
  ["mattress", ["mattress"]],
  ["bed", ["bed frame", "double bed", "single bed", "bunk bed", "bed 5x6", "bed 4x6", "bed 6x6", "bed"]],
  ["cushion-rug", ["cushion", "throw pillow", "rug", "carpet"]],
  ["sofa", ["sofa", "couch", "l-shaped seat", "loveseat"]],
  ["table", ["coffee table", "dining table", "table"]],
  ["chair", ["dining chair", "office chair", "plastic chair", "chair"]],
  ["cookware", ["sufuria", "frying pan", "pressure cooker", "saucepan", "cooking pot"]],
  ["utensils", ["spoon set", "cutlery", "knife set", "ladle", "serving spoon", "dinner set", "plates set", "cups set"]],
  // fashion
  ["socks", ["socks"]],
  ["shoe-care", ["shoe polish", "kiwi polish", "shoe brush", "shoe cleaner"]],
  ["shoes", ["shoes", "shoe", "sneakers", "sandals", "heels", "boots", "loafers", "slippers", "trainers"]],
  ["handbag", ["handbag", "clutch bag", "tote bag", "purse bag", "shoulder bag"]],
  ["wallet-purse", ["wallet", "purse"]],
  ["belt", ["belt"]],
  ["jewellery", ["necklace", "bracelet", "earrings", "ring", "chain", "anklet"]],
  ["watch", ["watch"]],
  ["fragrance", ["perfume", "fragrance", "body spray", "cologne", "eau de"]],
  ["makeup-skincare", ["lotion", "lipstick", "foundation", "skincare", "face cream", "makeup", "body oil"]],
  ["clothing", ["dress", "shirt", "t-shirt", "tshirt", "blouse", "trouser", "trousers", "jeans", "skirt", "jacket", "sweater", "hoodie", "kitenge", "suit", "shorts", "top", "tops"]],
  // building and hardware
  ["paint-tools", ["paint brush", "paint roller", "roller", "thinner", "masking tape", "putty", "sandpaper"]],
  ["paint", ["paint", "emulsion", "gloss"]],
  ["nails-fasteners", ["roofing nails", "nails", "screws", "bolts"]],
  ["iron-sheet", ["iron sheet", "iron sheets", "mabati", "roofing sheet"]],
  ["timber", ["timber", "plank", "rafters", "cypress"]],
  ["aggregate", ["ballast", "building sand", "river sand", "hardcore"]],
  ["cement-sand-bags", ["cement"]],
  ["pipe-fittings", ["elbow", "tee joint", "pipe fitting", "solvent cement", "pipe glue", "tap", "valve"]],
  ["pipe", ["ppr pipe", "pvc pipe", "pipe"]],
  ["water-tank", ["water tank", "tank"]],
  ["socket-switch", ["socket", "switch", "lamp holder"]],
  ["electrical-wire", ["electrical wire", "cable 2.5mm", "cable 1.5mm", "twin and earth", "wire"]],
  ["circuit-breaker", ["circuit breaker", "breaker", "consumer unit"]],
  ["light-fitting", ["light fitting", "ceiling light", "chandelier", "lamp shade", "wall light"]],
  ["led-bulb", ["bulb", "led bulb"]],
  ["engine-oil", ["engine oil", "motor oil"]],
  ["oil-filter", ["oil filter", "air filter", "fuel filter"]],
];

// product type id -> group, where they are not the same word. Everything else: the type id is the group.
const TYPE_GROUPS = {
  "dress-shirt": "clothing",
  "kids-clothing": "clothing",
  "scarf-hat-cap": "clothing",
  "necklace-chain-bracelet": "jewellery",
  earrings: "jewellery",
  ring: "jewellery",
  "cable": "phone-charger",
  "salon-service": "services",
  "spa-treatment": "services",
  "barbershop-service": "services",
  "gym-membership": "services",
  "phone-repair": "services",
  "shoe-repair": "services",
  "garage-service": "services",
  "car-wash": "services",
  "laundry-by-weight": "services",
  "laundry-by-item": "services",
  tailoring: "services",
  printing: "services",
  scanning: "services",
  lamination: "services",
  binding: "services",
  "typing-documents": "services",
  "passport-photos": "services",
  "banners-posters-cards": "services",
  "computer-internet-use": "services",
  "photo-package": "services",
  "prescription-medicine": "medicine",
  "vet-medicine": "medicine"
};

// group -> [[partner group, weight 1-10], ...]. Weight = how natural the pairing is; it orders the section.
// Groups with no entry (services, medicine, liquor, produce, ...) have nothing that goes with them.
export const COMPLEMENTS = {
  "restaurant-meal": [["soft-drink", 10], ["juice", 9], ["drinking-water", 7], ["cupcakes-pastries", 3]],
  "soft-drink": [["restaurant-meal", 6], ["cupcakes-pastries", 4], ["cake", 3]],
  juice: [["restaurant-meal", 6], ["cupcakes-pastries", 5], ["bread", 3]],
  "drinking-water": [["restaurant-meal", 5]],
  bread: [["spreads", 10], ["milk", 8], ["tea-coffee", 7], ["juice", 4], ["sugar", 3]],
  spreads: [["bread", 10], ["tea-coffee", 4]],
  milk: [["bread", 8], ["tea-coffee", 7], ["sugar", 5], ["cupcakes-pastries", 4]],
  "tea-coffee": [["milk", 9], ["sugar", 8], ["bread", 6], ["cupcakes-pastries", 5]],
  sugar: [["tea-coffee", 8], ["milk", 6]],
  cake: [["soft-drink", 6], ["juice", 6], ["tea-coffee", 4]],
  "cupcakes-pastries": [["tea-coffee", 8], ["juice", 7], ["milk", 6], ["soft-drink", 5]],
  "packaged-food": [["soft-drink", 5], ["juice", 4]],
  "lpg-gas": [["gas-accessory", 10], ["gas-cooker", 7], ["cookware", 5]],
  "gas-cooker": [["lpg-gas", 10], ["gas-accessory", 9], ["cookware", 6]],
  "gas-accessory": [["lpg-gas", 9], ["cookware", 4]],
  cookware: [["utensils", 8], ["lpg-gas", 5], ["gas-accessory", 4]],
  utensils: [["cookware", 7]],
  appliance: [["extension-multi-plug", 6]],
  phone: [["phone-case", 10], ["screen-protector", 9], ["phone-charger", 8], ["earphones-headphones", 7], ["power-bank", 6], ["memory-card", 5]],
  tablet: [["phone-charger", 7], ["memory-card", 6], ["earphones-headphones", 5], ["power-bank", 5]],
  "phone-case": [["screen-protector", 8], ["phone-charger", 5]],
  "screen-protector": [["phone-case", 8]],
  "phone-charger": [["power-bank", 6], ["phone-case", 4]],
  "power-bank": [["phone-charger", 6]],
  "earphones-headphones": [["power-bank", 4], ["phone-charger", 4]],
  laptop: [["mouse-keyboard", 10], ["laptop-charger", 8], ["backpack-travel-bag", 7], ["memory-card", 5], ["router-extender", 4], ["printer", 4]],
  "mouse-keyboard": [["laptop", 4]],
  printer: [["ink-toner", 10], ["paper-reams", 9], ["phone-charger", 2]],
  "ink-toner": [["paper-reams", 8]],
  "paper-reams": [["ink-toner", 6], ["pens-pencils-markers", 5]],
  tv: [["speaker-soundbar", 10], ["tv-mount", 9], ["extension-multi-plug", 6], ["router-extender", 4]],
  "speaker-soundbar": [["tv", 6], ["extension-multi-plug", 4]],
  clothing: [["shoes", 8], ["belt", 7], ["handbag", 6], ["jewellery", 5], ["watch", 4]],
  shoes: [["socks", 9], ["shoe-care", 7], ["clothing", 5], ["handbag", 5]],
  handbag: [["shoes", 6], ["wallet-purse", 5], ["jewellery", 5], ["fragrance", 4]],
  "wallet-purse": [["belt", 4]],
  belt: [["wallet-purse", 4]],
  fragrance: [["makeup-skincare", 6]],
  "makeup-skincare": [["fragrance", 5]],
  bed: [["mattress", 10], ["bedding", 9]],
  mattress: [["bedding", 10], ["bed", 6]],
  bedding: [["mattress", 5]],
  sofa: [["cushion-rug", 9], ["table", 7]],
  table: [["chair", 9]],
  chair: [["table", 7]],
  paint: [["paint-tools", 10]],
  "paint-tools": [["paint", 7]],
  "iron-sheet": [["nails-fasteners", 9], ["timber", 7]],
  timber: [["nails-fasteners", 8]],
  "cement-sand-bags": [["aggregate", 8]],
  pipe: [["pipe-fittings", 9]],
  "water-tank": [["pipe-fittings", 7], ["pipe", 6]],
  "electrical-wire": [["socket-switch", 8], ["circuit-breaker", 6]],
  "socket-switch": [["electrical-wire", 7]],
  "light-fitting": [["led-bulb", 9]],
  "led-bulb": [["light-fitting", 5]],
  "engine-oil": [["oil-filter", 8]]
};

const PATTERNS = PHRASES.map(([group, phrases]) => [
  group,
  phrases.map((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]*")}($|[^a-z0-9])`))
]);

const norm = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ");

/**
 * The group of an item: { name, productTypeId? } -> "restaurant-meal", "gas-accessory", ... or null when nothing is known.
 * The name decides first (it is the most specific); the product type is the fallback.
 */
export function complementGroupOf(item) {
  const name = norm(item?.name);
  if (name) {
    for (const [group, patterns] of PATTERNS) if (patterns.some((re) => re.test(name))) return group;
  }
  const type = item?.productTypeId ?? item?.productType ?? null;
  if (type) return TYPE_GROUPS[type] ?? String(type);
  return null;
}

/** The groups that go with `group`, strongest first: [{ group, weight }]. [] when nothing does. */
export function complementsOf(group) {
  return (COMPLEMENTS[group] ?? []).map(([g, weight]) => ({ group: g, weight })).sort((a, b) => b.weight - a.weight);
}

/** Whether anything at all goes with this item: decides if the section is worth asking for. */
export const hasComplements = (item) => complementsOf(complementGroupOf(item)).length > 0;

/** The weight (1-10) with which `candidate` goes with `item`, or 0. Never for the same group (that is "similar", not "goes with"). */
export function complementWeight(item, candidate) {
  const from = complementGroupOf(item);
  const to = complementGroupOf(candidate);
  if (!from || !to || from === to) return 0;
  return (COMPLEMENTS[from] ?? []).find(([g]) => g === to)?.[1] ?? 0;
}

/**
 * Single words to look partner items up by name (the live database searches item names word by word). For a meal: soda, coca,
 * cola, fanta, juice, water... Only words long enough to be useful, at most `max` of them, strongest partners first.
 */
export function complementSearchWords(group, max = 24) {
  // Words that say nothing about what a product is: they would only fill the pool with unrelated rows.
  const VAGUE = new Set(["soft", "drink", "drinks", "red", "energy", "minute", "maid", "bull", "fresh", "set", "pack", "special", "top", "with", "and", "for", "the"]);
  const lists = complementsOf(group).map(({ group: partner }) => {
    const phrases = PHRASES.find(([g]) => g === partner)?.[1] ?? [partner.replace(/-/g, " ")];
    const out = [];
    for (const phrase of phrases) {
      for (const w of norm(phrase).split(/[^a-z0-9]+/)) if (w.length >= 3 && !/^\d/.test(w) && !VAGUE.has(w) && !out.includes(w)) out.push(w);
    }
    return out;
  });
  // Round robin, strongest partner first: every partner gets words in, so a meal finds water as well as sodas.
  const words = [];
  for (let i = 0; words.length < max && lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) if (i < list.length && !words.includes(list[i]) && words.length < max) words.push(list[i]);
  }
  return words;
}

/** A number from a string, the same on every machine (FNV-1a), for the per-visit order. */
export function seededKey(seed, id) {
  let h = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
