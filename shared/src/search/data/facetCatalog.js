// Product search filters for everything the shops on EpicMKT sell. Two parts:
//
//   FACETS  every filter a shopper can use: its label, how its values are read from a product (a spec row, an option value,
//           or the words in the name and description), and how they group (fixed choices, or number ranges like Amazon's
//           "70 to 134 W").
//   KINDS   the kinds of product (speakers, phones, dresses, cement ...), how to recognise each from its name, section and
//           shop category, and which filters fit it. The product types seeded in A24 to A28 were the checklist: every
//           department there has a kind here, with the type's own required and recommended rows as its filters.
//
// Everything here is data plus small pure readers, so the browser and the /api/products endpoint use the same rules.

const rx = (source) => new RegExp(source, "i");
const choice = (id, label, pattern) => ({ id, label, re: rx(pattern) });

// ---- number readers ------------------------------------------------------------------------------------------------
// A range filter reads one number: from a spec row whose label matches `spec`, else from the product's words.
const num = (s) => Number(String(s).replace(/,/g, ""));
export const readers = {
  watts: { spec: /power|output|watt|wattage/i, re: /(\d{1,4}(?:\.\d+)?)\s?(?:w|watts?)\b/i },
  hours: { spec: /battery|playtime|play time/i, re: /(\d{1,3}(?:\.\d+)?)\s?(?:h|hrs?|hours?)\b/i },
  inches: { spec: /screen|size|display/i, re: /(\d{2,3}(?:\.\d+)?)\s?(?:"|”|in\b|inch(?:es)?)/i },
  gb: { spec: /storage|capacity|memory|rom/i, re: /(\d{1,4})\s?(gb|tb)\b/i, scale: (m) => num(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1) },
  ramGb: { spec: /\bram\b/i, re: /(\d{1,2})\s?gb\s?ram|ram[^\d]{0,6}(\d{1,2})\s?gb/i, scale: (m) => num(m[1] ?? m[2]) },
  mah: { spec: /capacity|battery/i, re: /(\d{3,5})\s?mah/i },
  metres: { spec: /length|cable/i, re: /(\d{1,3}(?:\.\d+)?)\s?(?:m|metres?|meters?)\b/i },
  litres: { spec: /volume|capacity|size/i, re: /(\d{1,4}(?:\.\d+)?)\s?(l|ltrs?|litres?|liters?|ml)\b/i, scale: (m) => num(m[1]) / (/^ml$/i.test(m[2]) ? 1000 : 1) },
  ml: { spec: /volume|size/i, re: /(\d{1,4})\s?ml\b/i },
  kg: { spec: /weight|pack|bag|size/i, re: /(\d{1,4}(?:\.\d+)?)\s?(kg|g)\b/i, scale: (m) => num(m[1]) / (/^g$/i.test(m[2]) ? 1000 : 1) },
  minutes: { spec: /duration|time|length/i, re: /(\d{1,3})\s?(min|minutes?|h|hours?)\b/i, scale: (m) => num(m[1]) * (/^h/i.test(m[2]) ? 60 : 1) },
  seats: { spec: /seats?|seater/i, re: /(\d)\s?-?\s?seater|(\d)\s?seats?/i, scale: (m) => num(m[1] ?? m[2]) },
  shoeEu: { spec: /size/i, re: /\b(3[5-9]|4[0-8])\b/ }
};

export function readNumber(reader, product) {
  const parse = (text) => {
    const m = String(text ?? "").match(reader.re);
    if (!m) return null;
    const value = reader.scale ? reader.scale(m) : num(m[1]);
    return Number.isFinite(value) ? value : null;
  };
  for (const s of product.specs ?? []) {
    if (reader.spec.test(s.label ?? "")) {
      const v = parse(s.value) ?? (Number.isFinite(num(s.value)) && /^\s*[\d.,]+\s*$/.test(String(s.value)) ? num(s.value) : null);
      if (v !== null) return v;
    }
  }
  return parse(`${product.name ?? ""} ${product.shortDescription ?? ""}`) ?? parse((product.optionValues ?? []).join(" "));
}

const range = (id, label, reader, buckets, unit = "") => ({
  id,
  label,
  type: "range",
  reader,
  unit,
  values: buckets.map(([min, max, text]) => ({ id: `${min}-${max ?? ""}`, label: text, min, max }))
});

// ---- the filters ---------------------------------------------------------------------------------------------------
export const FACETS = {
  // Sound
  connectivity: {
    id: "connectivity", label: "Connectivity", type: "choice",
    values: [choice("bluetooth", "Bluetooth", "bluetooth"), choice("wifi", "Wi-Fi", "wi-?fi|airplay|chromecast"), choice("usb", "USB", "\\busb\\b|usb-c|type-c"),
      choice("aux", "Auxiliary (3.5 mm)", "\\baux(iliary)?\\b|3\\.5 ?mm"), choice("hdmi", "HDMI", "hdmi"), choice("optical", "Optical", "optical"),
      choice("rca", "RCA", "\\brca\\b"), choice("fm", "FM radio", "\\bfm\\b"), choice("nfc", "NFC", "\\bnfc\\b"), choice("xlr", "XLR", "\\bxlr\\b")]
  },
  power: range("power", "Max power output", "watts", [[0, 69, "Up to 69 W"], [70, 134, "70 to 134 W"], [135, 199, "135 to 199 W"], [200, null, "200 W & above"]], "W"),
  battery: range("battery", "Battery life", "hours", [[0, 4.9, "Up to 4.9 h"], [5, 7.9, "5 to 7.9 h"], [8, 10.9, "8 to 10.9 h"], [11, 13.9, "11 to 13.9 h"], [14, null, "14 h & above"]], "h"),
  water: {
    id: "water", label: "Water resistance", type: "choice",
    values: [choice("waterproof", "Waterproof (IP67, IP68)", "ip6[78]|ipx[78]|waterproof"), choice("resistant", "Water resistant (IPX4 to IPX6)", "ipx[4-6]|ip[56][4-6]|splash|water resistant"),
      choice("none", "Not water resistant", "mains \\(plug-in\\)|not water")]
  },
  audioOutput: { id: "audioOutput", label: "Audio output mode", type: "choice", values: [choice("mono", "Mono", "\\bmono\\b"), choice("stereo", "Stereo", "stereo"), choice("surround", "Surround", "surround|5\\.1|7\\.1|dolby atmos")] },
  speakerType: {
    id: "speakerType", label: "Speaker type", type: "choice",
    values: [choice("portable", "Portable", "portable|pocket|compact|strap"), choice("party", "Party speaker", "party speaker|partybox|boombox|light show|karaoke"), choice("soundbar", "Soundbar", "sound ?bar"),
      choice("hometheatre", "Home theatre", "home theat|2\\.1|5\\.1|subwoofer"), choice("home", "Home speaker", "home speaker|bookshelf|mains")]
  },
  powerSource: { id: "powerSource", label: "Power source", type: "choice", values: [choice("battery", "Battery", "battery|playtime|power ?bank"), choice("mains", "Mains (plug-in)", "mains|plug-in|plugs into")] },
  headphoneType: { id: "headphoneType", label: "Headphone type", type: "choice", values: [choice("earbuds", "True wireless earbuds", "earbud|true wireless|tws|airpod"), choice("overear", "Over-ear", "over-?ear|headphone"), choice("neckband", "Neckband", "neckband"), choice("wired", "Wired earphones", "wired|earphone")] },
  // Screens
  screen: range("screen", "Screen size", "inches", [[0, 32, "Up to 32 in"], [33, 43, "33 to 43 in"], [44, 55, "44 to 55 in"], [56, 65, "56 to 65 in"], [66, null, "66 in & above"]], "in"),
  phoneScreen: range("phoneScreen", "Screen size", "inches", [[0, 5.9, "Up to 5.9 in"], [6, 6.4, "6 to 6.4 in"], [6.5, 6.9, "6.5 to 6.9 in"], [7, null, "7 in & above"]], "in"),
  resolution: { id: "resolution", label: "Resolution", type: "choice", values: [choice("8k", "8K", "\\b8k\\b"), choice("4k", "4K UHD", "\\b4k\\b|uhd|2160"), choice("fhd", "Full HD", "full hd|fhd|1080"), choice("hd", "HD", "\\bhd ready\\b|\\b720p?\\b|\\bhd\\b(?! ready)")] },
  smartPlatform: { id: "smartPlatform", label: "Smart TV platform", type: "choice", values: [choice("android", "Android TV / Google TV", "android tv|google tv"), choice("vidaa", "VIDAA", "vidaa"), choice("webos", "webOS", "webos"), choice("tizen", "Tizen", "tizen"), choice("none", "Not smart", "not smart|digital tv")] },
  // Phones and computers
  storage: range("storage", "Storage", "gb", [[0, 32, "Up to 32 GB"], [33, 64, "64 GB"], [65, 128, "128 GB"], [129, 256, "256 GB"], [257, 512, "512 GB"], [513, null, "1 TB & above"]]),
  ram: range("ram", "RAM", "ramGb", [[0, 3, "Up to 3 GB"], [4, 4, "4 GB"], [5, 6, "6 GB"], [7, 8, "8 GB"], [9, 12, "12 GB"], [13, null, "16 GB & above"]]),
  network: { id: "network", label: "Network", type: "choice", values: [choice("5g", "5G", "\\b5g\\b"), choice("4g", "4G LTE", "\\b4g\\b|lte"), choice("3g", "3G", "\\b3g\\b")] },
  os: { id: "os", label: "Operating system", type: "choice", values: [choice("android", "Android", "android"), choice("ios", "iOS", "iphone|ios\\b|apple"), choice("windows", "Windows", "windows"), choice("macos", "macOS", "macbook|macos"), choice("chrome", "ChromeOS", "chromebook|chromeos")] },
  processor: { id: "processor", label: "Processor", type: "choice", values: [choice("i3", "Intel Core i3", "core i3"), choice("i5", "Intel Core i5", "core i5"), choice("i7", "Intel Core i7", "core i7"), choice("celeron", "Intel Celeron / Pentium", "celeron|pentium"), choice("ryzen", "AMD Ryzen", "ryzen"), choice("apple", "Apple M series", "\\bm[1-4]\\b")] },
  connector: { id: "connector", label: "Connector type", type: "choice", values: [choice("usbc", "USB Type-C", "usb-?c|type-?c"), choice("lightning", "Lightning", "lightning|iphone"), choice("micro", "Micro USB", "micro ?usb"), choice("usba", "USB Type-A", "usb-?a\\b|usb 3\\.0|usb 2\\.0")] },
  chargerPower: range("chargerPower", "Charging power", "watts", [[0, 20, "Up to 20 W"], [21, 45, "21 to 45 W"], [46, 65, "46 to 65 W"], [66, null, "66 W & above"]], "W"),
  capacityMah: range("capacityMah", "Battery capacity", "mah", [[0, 9999, "Up to 9,999 mAh"], [10000, 19999, "10,000 to 19,999 mAh"], [20000, null, "20,000 mAh & above"]], "mAh"),
  cableLength: range("cableLength", "Cable length", "metres", [[0, 1, "Up to 1 m"], [1.01, 2, "1 to 2 m"], [2.01, null, "Over 2 m"]], "m"),
  // Lighting and power
  lightBase: { id: "lightBase", label: "Bulb base", type: "choice", values: ["E27", "E14", "B22", "GU10", "MR16"].map((b) => choice(b.toLowerCase(), b, `\\b${b}\\b`)) },
  lightColour: { id: "lightColour", label: "Light colour", type: "choice", values: [choice("warm", "Warm white", "warm|3000 ?k|2700 ?k"), choice("cool", "Cool white", "cool white|4000 ?k"), choice("daylight", "Daylight", "daylight|6500 ?k"), choice("rgb", "Colour changing (RGB)", "\\brgb\\b|colour changing")] },
  lampPower: range("lampPower", "Wattage", "watts", [[0, 9, "Up to 9 W"], [10, 20, "10 to 20 W"], [21, 50, "21 to 50 W"], [51, null, "Over 50 W"]], "W"),
  batterySize: { id: "batterySize", label: "Battery size", type: "choice", values: ["AA", "AAA", "C", "D", "9V", "CR2032"].map((b) => choice(b.toLowerCase(), b, `\\b${b}\\b`)) },
  chemistry: { id: "chemistry", label: "Chemistry", type: "choice", values: [choice("alkaline", "Alkaline", "alkaline"), choice("lithium", "Lithium", "lithium|li-?ion"), choice("rechargeable", "Rechargeable", "rechargeable|nimh"), choice("leadacid", "Lead acid", "lead acid|car battery")] },
  // Clothes, shoes and accessories
  clothingSize: { id: "clothingSize", label: "Size", type: "choice", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL"].map((z) => choice(z.toLowerCase(), z, `(?:^|[^a-z])${z}(?:$|[^a-z])`)) },
  fit: { id: "fit", label: "Fit", type: "choice", values: [choice("slim", "Slim", "slim"), choice("regular", "Regular", "regular fit"), choice("loose", "Loose / oversized", "loose|oversized|relaxed")] },
  fabric: { id: "fabric", label: "Fabric", type: "choice", values: [choice("cotton", "Cotton", "cotton"), choice("denim", "Denim", "denim|jeans"), choice("ankara", "Ankara / kitenge", "ankara|kitenge"), choice("linen", "Linen", "linen"), choice("polyester", "Polyester", "polyester"), choice("silk", "Silk / satin", "silk|satin"), choice("wool", "Wool / knit", "wool|knit|sweater")] },
  gender: { id: "gender", label: "For", type: "choice", values: [choice("women", "Women", "women|ladies|lady|female|\\bher\\b"), choice("men", "Men", "\\bmen\\b|men's|gents|male|\\bhis\\b"), choice("kids", "Kids", "kid|child|boys|girls|school"), choice("unisex", "Unisex", "unisex")] },
  shoeSize: range("shoeSize", "Shoe size (EU)", "shoeEu", [[35, 37, "EU 35 to 37"], [38, 40, "EU 38 to 40"], [41, 43, "EU 41 to 43"], [44, null, "EU 44 & above"]]),
  shoeType: { id: "shoeType", label: "Style", type: "choice", values: [choice("sneakers", "Sneakers", "sneaker|trainer|rubber shoe"), choice("official", "Official", "official|oxford|loafer"), choice("sandals", "Sandals", "sandal|slipper|flip"), choice("heels", "Heels", "heel"), choice("boots", "Boots", "boot")] },
  material: { id: "material", label: "Material", type: "choice", values: [choice("leather", "Leather", "leather"), choice("canvas", "Canvas", "canvas"), choice("suede", "Suede", "suede"), choice("wood", "Wood", "wood|mahogany|mvule|pine|cypress|oak"), choice("metal", "Metal", "metal|steel|iron|alumin"), choice("plastic", "Plastic", "plastic|pvc|abs"), choice("fabric", "Fabric", "fabric|velvet|cotton")] },
  metal: { id: "metal", label: "Metal", type: "choice", values: [choice("gold", "Gold", "gold"), choice("silver", "Silver", "silver|925"), choice("steel", "Stainless steel", "stainless"), choice("brass", "Brass / fashion", "brass|fashion|plated")] },
  purity: { id: "purity", label: "Purity", type: "choice", values: ["24K", "22K", "18K", "14K", "925"].map((k) => choice(k.toLowerCase(), k === "925" ? "Sterling 925" : k, `\\b${k}\\b`)) },
  concentration: { id: "concentration", label: "Concentration", type: "choice", values: [choice("parfum", "Parfum", "\\bparfum\\b|extrait"), choice("edp", "Eau de parfum", "eau de parfum|\\bedp\\b"), choice("edt", "Eau de toilette", "eau de toilette|\\bedt\\b"), choice("spray", "Body spray / mist", "body spray|mist"), choice("oil", "Perfume oil / oud", "\\boil\\b|oud|attar")] },
  scentFor: { id: "scentFor", label: "For", type: "choice", values: [choice("women", "Women", "women|ladies|her\\b"), choice("men", "Men", "\\bmen\\b|men's|him\\b"), choice("unisex", "Unisex", "unisex")] },
  volumeMl: range("volumeMl", "Volume", "ml", [[0, 30, "Up to 30 ml"], [31, 60, "31 to 60 ml"], [61, 100, "61 to 100 ml"], [101, null, "Over 100 ml"]], "ml"),
  authenticity: { id: "authenticity", label: "Authenticity", type: "choice", values: [choice("original", "Original", "original|genuine|authentic"), choice("inspired", "Inspired by", "inspired|impression|dupe")] },
  // Home
  seats: range("seats", "Seats", "seats", [[1, 1, "1 seat"], [2, 2, "2-seater"], [3, 3, "3-seater"], [4, 5, "4 to 5 seats"], [6, null, "6 seats & above"]]),
  room: { id: "room", label: "Room", type: "choice", values: [choice("living", "Living room", "sofa|couch|coffee table|tv stand|living"), choice("bedroom", "Bedroom", "bed|mattress|wardrobe|dressing"), choice("dining", "Dining", "dining"), choice("office", "Office", "office|desk|study"), choice("kitchen", "Kitchen", "kitchen|cooker|pan|pot|cup")] },
  bedSize: { id: "bedSize", label: "Bed size", type: "choice", values: [choice("3x6", "3 x 6 ft", "3 ?x ?6"), choice("4x6", "4 x 6 ft", "4 ?x ?6"), choice("5x6", "5 x 6 ft", "5 ?x ?6"), choice("6x6", "6 x 6 ft", "6 ?x ?6")] },
  capacityL: range("capacityL", "Capacity", "litres", [[0, 1.9, "Up to 2 L"], [2, 9.9, "2 to 10 L"], [10, 99, "10 to 99 L"], [100, null, "100 L & above"]], "L"),
  burners: { id: "burners", label: "Burners", type: "choice", values: [choice("1", "Single burner", "single|one burner|1 burner"), choice("2", "Two burners", "two-?burner|2 burner|double"), choice("3", "Three or more", "three|four|3 burner|4 burner")] },
  // Food, water, health, farm
  weight: range("weight", "Pack weight", "kg", [[0, 0.5, "Up to 500 g"], [0.51, 1, "500 g to 1 kg"], [1.01, 5, "1 to 5 kg"], [5.01, 25, "5 to 25 kg"], [25.01, null, "Over 25 kg"]]),
  dietary: { id: "dietary", label: "Dietary", type: "choice", values: [choice("halal", "Halal", "halal"), choice("veg", "Vegetarian", "vegetarian|vegan|veg\\b"), choice("sugarfree", "Sugar free", "sugar[- ]free|no sugar"), choice("glutenfree", "Gluten free", "gluten[- ]free")] },
  waterSize: range("waterSize", "Container size", "litres", [[0, 5, "Up to 5 L"], [5.01, 10, "6 to 10 L"], [10.01, 20, "11 to 20 L"], [20.01, null, "Over 20 L"]], "L"),
  fill: { id: "fill", label: "How it is filled", type: "choice", values: [choice("refill", "Refill (bring your bottle)", "refill"), choice("new", "New bottle with water", "new bottle|with bottle|dispenser")] },
  dosageForm: { id: "dosageForm", label: "Form", type: "choice", values: [choice("tablet", "Tablets", "tablet|tabs\\b"), choice("capsule", "Capsules", "capsule"), choice("syrup", "Syrup", "syrup|suspension"), choice("cream", "Cream / ointment", "cream|ointment|gel"), choice("drops", "Drops", "drops"), choice("device", "Device / kit", "kit|thermometer|monitor|strips")] },
  prescription: { id: "prescription", label: "Prescription", type: "choice", values: [choice("otc", "No prescription needed", "over the counter|\\botc\\b|no prescription"), choice("rx", "Prescription only", "prescription only|\\brx\\b|antibiotic")] },
  farmUse: { id: "farmUse", label: "Use", type: "choice", values: [choice("crops", "Crops", "seed|fertili[sz]er|crop|maize|tomato|kale|sukuma|sprayer|pesticide|herbicide"), choice("animals", "Animals", "cattle|dairy|poultry|layers|chick|feed|mash|dewormer|acaricide|tick|vet")] },
  farmType: { id: "farmType", label: "Product", type: "choice", values: [choice("seed", "Seeds", "seed"), choice("fert", "Fertiliser", "fertili[sz]er|\\bcan\\b|\\bdap\\b|npk|urea"), choice("feed", "Animal feed", "feed|mash|meal|pellets"), choice("chem", "Sprays and chemicals", "acaricide|pesticide|herbicide|fungicide|spray"), choice("vet", "Vet medicine", "dewormer|vaccine|antibiotic|vet"), choice("tools", "Tools and equipment", "sprayer|pump|tank|tool")] },
  // Building and auto
  buildMaterial: { id: "buildMaterial", label: "Material", type: "choice", values: [choice("cement", "Cement", "cement"), choice("steel", "Steel / iron", "steel|iron|rebar|y12|y10|mabati"), choice("timber", "Timber", "timber|wood|plank"), choice("paint", "Paint", "paint|emulsion|gloss"), choice("pvc", "PVC / plastic", "pvc|ppr|plastic"), choice("copper", "Copper / electrical", "copper|cable|wire|socket")] },
  vehicle: { id: "vehicle", label: "Fits vehicle", type: "choice", values: ["Toyota", "Nissan", "Subaru", "Mazda", "Honda", "Mitsubishi", "Isuzu", "Mercedes", "Volkswagen"].map((m) => choice(m.toLowerCase(), m, m)) },
  partCondition: { id: "partCondition", label: "Part condition", type: "choice", values: [choice("genuine", "Genuine", "genuine|original|oem"), choice("aftermarket", "Aftermarket", "aftermarket|compatible"), choice("used", "Ex-Japan / used", "ex-?japan|used|second")] },
  // Services and print
  serviceFor: { id: "serviceFor", label: "For", type: "choice", values: [choice("women", "Women", "women|ladies|braid|weave|manicure|pedicure"), choice("men", "Men", "\\bmen\\b|men's|beard|shave|fade"), choice("kids", "Kids", "kid|child")] },
  booking: { id: "booking", label: "Booking", type: "choice", values: [choice("walkin", "Walk-in", "walk-?in"), choice("appointment", "Appointment", "appointment|booking|book ")] },
  duration: range("duration", "Duration", "minutes", [[0, 30, "Up to 30 min"], [31, 60, "31 to 60 min"], [61, 120, "1 to 2 hours"], [121, null, "Over 2 hours"]]),
  paperSize: { id: "paperSize", label: "Paper size", type: "choice", values: ["A3", "A4", "A5", "A6"].map((p) => choice(p.toLowerCase(), p, `\\b${p}\\b`)) },
  colourMode: { id: "colourMode", label: "Colour mode", type: "choice", values: [choice("bw", "Black and white", "black and white|b ?& ?w|mono"), choice("colour", "Colour", "colou?r print|full colou?r")] }
};

// ---- kinds of product ------------------------------------------------------------------------------------------------
// Order matters: the first kind whose pattern matches wins, so accessories come before the devices they fit.
// `noun` is what a related search says ("JBL speakers"); `cats` are shop categories whose items are this kind by default.
const kind = (id, label, department, noun, pattern, facets, cats = []) => ({ id, label, department, noun, re: rx(pattern), facets, cats });

export const KINDS = [
  kind("headphones", "Headphones and earbuds", "Electronics", "earbuds", "earbud|earphone|headphone|headset|airpod|buds\\b", ["headphoneType", "connectivity", "battery", "water"]),
  kind("speakers", "Speakers and sound", "Electronics", "speakers", "speaker|sound ?bar|home theat|subwoofer|partybox|boombox|woofer|amplifier|sound system", ["connectivity", "power", "battery", "water", "audioOutput", "speakerType", "powerSource"], []),
  kind("tvs", "TVs", "Electronics", "TVs", "\\btv\\b|television|smart tv|\\bled tv", ["screen", "resolution", "smartPlatform", "connectivity"]),
  kind("phone-accessories", "Phone accessories", "Phones", "phone accessories", "phone case|screen protector|charger|cable|power ?bank|earphone holder|adapter|car holder", ["connector", "chargerPower", "capacityMah", "cableLength"]),
  kind("phones", "Phones and tablets", "Phones", "phones", "phone|iphone|galaxy|smartphone|tecno|infinix|itel|redmi|xiaomi|tablet|ipad|feature phone", ["storage", "ram", "network", "os", "phoneScreen"], ["phones-accessories"]),
  kind("laptops", "Laptops and computers", "Computers", "laptops", "laptop|notebook|macbook|ideapad|latitude|elitebook|thinkpad|desktop|all-in-one|computer\\b", ["processor", "ram", "storage", "screen", "os"], []),
  kind("computer-accessories", "Computer accessories", "Computers", "computer accessories", "monitor|keyboard|mouse|router|flash disk|hard ?disk|memory card|sd card|ssd|ups\\b|webcam|printer|toner|ink", ["connectivity", "storage", "connector"], ["electronics-computers"]),
  kind("lighting", "Lighting", "Lighting", "bulbs and lights", "bulb|lamp|light\\b|lights\\b|tube light|floodlight|led strip|torch", ["lightBase", "lightColour", "lampPower"]),
  kind("batteries", "Batteries", "Batteries", "batteries", "battery|batteries|solar panel|inverter", ["batterySize", "chemistry", "capacityMah"]),
  kind("shoes", "Shoes", "Shoes", "shoes", "shoe|sneaker|sandal|heels|boot|loafer|slipper|trainer", ["shoeSize", "shoeType", "material", "gender"]),
  kind("bags", "Bags and wallets", "Bags", "bags", "handbag|backpack|wallet|purse|tote|suitcase|\\bbag\\b", ["material", "gender"]),
  kind("jewellery", "Jewellery and watches", "Jewellery", "jewellery", "necklace|chain|bracelet|earring|\\bring\\b|bangle|pendant|anklet|watch", ["metal", "purity", "gender"]),
  kind("fragrance", "Fragrance", "Fragrance", "perfumes", "perfume|fragrance|cologne|eau de|body spray|\\boud\\b|\\bedp\\b|\\bedt\\b|deodorant", ["concentration", "scentFor", "volumeMl", "authenticity"]),
  kind("clothing", "Clothing", "Clothing", "clothes", "dress|shirt|blouse|jeans|trouser|skirt|jacket|sweater|t-shirt|tshirt|suit|kitenge|ankara|hoodie|\\btop\\b|tops\\b|shorts|uniform|kanzu|leggings|abaya", ["clothingSize", "fit", "fabric", "gender"], ["fashion-boutiques", "tailors"]),
  kind("beauty", "Beauty and hair", "Beauty", "beauty products", "lotion|cream|shampoo|conditioner|wig|braid|weave|hair|makeup|lipstick|serum|soap|nail|lashes|relaxer|manicure|pedicure|facial", ["gender"], ["salons"]),
  kind("furniture", "Furniture", "Furniture", "furniture", "sofa|couch|chair|table|\\bbed\\b|wardrobe|cabinet|shelf|desk|mattress|tv stand|stool", ["material", "seats", "room", "bedSize"], []),
  kind("kitchen", "Home and kitchen", "Home", "home and kitchen", "cooker|blender|kettle|fridge|refrigerator|microwave|\\bpan\\b|\\bpot\\b|jiko|gas cylinder|fryer|iron box|flask|thermos|plates|cups|cutlery|dispenser|curtain|bedsheet|duvet|towel", ["capacityL", "burners", "room", "material"], ["home-kitchen"]),
  kind("water", "Drinking water", "Water and energy", "water", "water|refill|jerrican", ["waterSize", "fill"], ["water-refill"]),
  kind("food", "Food and drink", "Food and drink", "food", "bread|cake|meat|beef|goat|chicken|mutton|fish|milk|juice|flour|rice|sugar|cooking oil|samosa|mandazi|chapati|pilau|biryani|tea|coffee|snack|cupcake|pizza|burger|soda|yoghurt|eggs|sausage", ["weight", "dietary"], ["bakery", "butchery", "eateries", "groceries"]),
  kind("medicine", "Health and pharmacy", "Medicine and health", "pharmacy products", "tablet|capsule|syrup|paracetamol|ibuprofen|\\d+ ?mg\\b|ointment|vitamin|test kit|condom|sanitiser|sanitizer|mask|thermometer|pressure|glucose|first aid|pregnancy", ["dosageForm", "prescription"], ["chemists"]),
  kind("farm", "Farm inputs", "Farm inputs", "farm inputs", "seed|fertili[sz]er|\\bfeed\\b|dewormer|acaricide|pesticide|herbicide|sprayer|mash|dairy meal|chick|vaccine|vet\\b", ["farmType", "farmUse", "weight"], ["agrovets"]),
  kind("hardware", "Building and hardware", "Hardware and building", "building materials", "cement|nail|paint|pipe|wire|timber|iron sheet|mabati|tile|bolt|tool|hammer|wheelbarrow|padlock|hinge|sand|ballast|rebar|tank", ["buildMaterial", "weight"], ["hardware"]),
  kind("auto", "Car parts and care", "Auto parts", "car parts", "tyre|tire|brake|oil filter|engine oil|spark plug|wiper|shock absorber|car wash|car battery|bumper|headlight", ["vehicle", "partCondition"], ["mechanics", "car-wash"]),
  kind("printing", "Printing and stationery", "Printing services", "printing", "print|photocopy|lamination|binding|scan|passport photo|banner|business card|stationery|pen\\b|exercise book|ream", ["paperSize", "colourMode"], []),
  kind("services", "Services", "Services", "services", "haircut|cut\\b|shave|beard|massage|membership|session|class|training|repair|service|installation|cleaning|laundry|wash|tuition", ["serviceFor", "booking", "duration"], ["barbershops", "gyms", "mpesa"])
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// Filters every product gets, whatever its kind. "Customer reviews" is left out on purpose: EpicMKT shows no ratings.
export const COMMON_FACETS = ["brand", "price", "colour", "condition", "deals", "delivery", "shop", "town", "store"];

// The colour swatches, in Amazon's order. A product's colours come from its colour option's values, else from colour words.
// Whole words only, so "Bluetooth" is not blue, "stand" is not tan and "face cream" is not a colour. Food words that are also
// colours (coffee, chocolate, lemon, mint, wine) are left out: a coffee table is not brown by name.
const word = (alts) => new RegExp(`\\b(?:${alts})\\b`, "i");
export const COLOURS = [
  { id: "black", label: "Black", hex: "#1f2328", re: word("black|charcoal|midnight|jet black") },
  { id: "white", label: "White", hex: "#ffffff", re: word("white|ivory|off-white") },
  { id: "grey", label: "Grey", hex: "#9ca3af", re: word("gr[ae]y|silver|graphite|space gr[ae]y") },
  { id: "brown", label: "Brown", hex: "#6b4f3a", re: word("brown|mahogany|walnut|espresso") },
  { id: "beige", label: "Beige", hex: "#d6c7a8", re: word("beige|khaki|nude|camel|taupe") },
  { id: "red", label: "Red", hex: "#c0262d", re: word("red|maroon|burgundy|crimson|scarlet") },
  { id: "pink", label: "Pink", hex: "#f4b6c2", re: word("pink|rose|blush|fuchsia|magenta") },
  { id: "orange", label: "Orange", hex: "#f28c28", re: word("orange|coral|amber") },
  { id: "yellow", label: "Yellow", hex: "#f6e05e", re: word("yellow|mustard") },
  { id: "green", label: "Green", hex: "#3c9a3c", re: word("green|olive|camo|teal|emerald|lime green") },
  { id: "blue", label: "Blue", hex: "#24508f", re: word("blue|navy|denim|cyan|turquoise|sky blue") },
  { id: "purple", label: "Purple", hex: "#8b45d6", re: word("purple|violet|lilac|lavender|plum") },
  { id: "gold", label: "Gold", hex: "#d4b45c", re: word("gold|golden|champagne") },
  { id: "multi", label: "Multicolour", hex: null, re: word("multi|multi-?colou?r(?:ed)?|rainbow|printed|rgb") }
];
