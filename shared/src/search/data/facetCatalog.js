// Product search filters for everything the shops on EpicMKT sell. Three parts:
//
//   FACETS  every filter a shopper can use: its label, how its values are read from a product (a spec row, an option value,
//           or the words in the name and description), and how they group (fixed choices, or number ranges like Amazon's
//           "70 to 134 W").
//   KINDS   the kinds of product (speakers, soda, beds, haircuts, timber, plates of pilau ...): how to recognise each one, and
//           which filters fit it. A product is placed by, in order: its product type (the 111 seeded types, A24 to A28, each
//           belong to exactly one kind), the words in its name and section (preferring a kind its shop's category sells),
//           then its shop's category. Every one of the 36 live categories has kinds here.
//   COLOURS the colour swatches.
//
// Everything here is data plus small pure readers, so the browser and the /api/products endpoint use the same rules. Category
// ids live here on purpose (this is a data file): they say which shops sell which kind by default.

import { COVERAGE_TYPE_KINDS } from "./coverageKinds.js";

const rx = (source) => new RegExp(source, "i");
// Whole words, with an optional plural: words("dress|shirt") matches "dresses" and "shirts" but not "address".
const words = (alts) => rx(`\\b(?:${alts})(?:e?s)?\\b`);
const choice = (id, label, pattern) => ({ id, label, re: rx(pattern) });
const opt = (id, label, alts) => ({ id, label, re: words(alts) });

// ---- number readers ------------------------------------------------------------------------------------------------
// A range filter reads one number: from a spec row whose label matches `spec`, else from the product's name and short text.
const num = (s) => Number(String(s).replace(/,/g, ""));
export const readers = {
  // "2kW" is 2,000 W, so a 2 kW solar kit and a 2000 W one fall in the same range.
  watts: { spec: /power|output|watt|wattage|system size/i, re: /(\d{1,4}(?:\.\d+)?)\s?(k?w|watts?)\b/i, scale: (m) => num(m[1]) * (/^kw$/i.test(m[2]) ? 1000 : 1) },
  hours: { spec: /battery|playtime|play time/i, re: /(\d{1,3}(?:\.\d+)?)\s?(?:h|hrs?|hours?)\b/i },
  inches: { spec: /screen|size|display/i, re: /(\d{2,3}(?:\.\d+)?)\s?(?:"|”|in\b|inch(?:es)?)/i },
  smallInches: { spec: /screen|display/i, re: /(\d{1,2}(?:\.\d+)?)\s?(?:"|”|in\b|inch(?:es)?)/i },
  gb: { spec: /storage|capacity|memory|rom/i, re: /(\d{1,4})\s?(gb|tb)\b/i, scale: (m) => num(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1) },
  // "8GB RAM" in a name, or a RAM spec row whose value is just "8 GB".
  ramGb: { spec: /\bram\b|memory \(ram\)/i, re: /(\d{1,2})\s?gb\s?ram|ram[^\d]{0,6}(\d{1,2})\s?gb|^\s*(\d{1,2})\s?gb\s*$/i, scale: (m) => num(m[1] ?? m[2] ?? m[3]) },
  mah: { spec: /capacity|battery/i, re: /(\d{3,5})\s?mah/i },
  metres: { spec: /length|cable/i, re: /(\d{1,3}(?:\.\d+)?)\s?(?:m|metres?|meters?)\b/i },
  // Litres and millilitres are one scale: "1000 ml" and "1 L" are the same size, "500mls" is half a litre.
  litres: { spec: /volume|capacity|size/i, re: /(\d{1,5}(?:\.\d+)?)\s?(l|lts?|ltrs?|litres?|liters?|ml|mls|millilit(?:re|er)s?)\b/i, scale: (m) => num(m[1]) / (/^m/i.test(m[2]) ? 1000 : 1) },
  ml: { spec: /volume|size/i, re: /(\d{1,4}(?:\.\d+)?)\s?(ml|mls|l|ltrs?|litres?)\b/i, scale: (m) => num(m[1]) * (/^m/i.test(m[2]) ? 1 : 1000) },
  // Kilograms and grams are one scale: "1 kg", "1000 g", "1,000gms" and "1 kilo" all read 1.
  kg: { spec: /weight|pack|bag|size|cylinder/i, re: /(\d{1,4}(?:\.\d+)?)\s?(kgs?|kilos?|kilograms?|g|gms?|grams?|grammes?)\b/i, scale: (m) => num(m[1]) / (/^g/i.test(m[2]) ? 1000 : 1) },
  gsm: { spec: /gsm|paper weight|grammage|thickness/i, re: /(\d{2,3})\s?(?:gsm|g\/m2|g\/m²|grams? per square met(?:re|er))\b/i },
  cc: { spec: /engine|displacement|\bcc\b/i, re: /(\d{2,4})\s?cc\b/i },
  year: { spec: /^(?:year|model year|year of (?:make|manufacture)|yom)$/i, re: /\b(19[89]\d|20[0-3]\d)\b/ },
  // A warranty in months: "12 months warranty", "warranty: 1 year", or a Warranty row that says "6 months".
  months: {
    spec: /warranty|guarantee/i,
    re: /(\d{1,2})\s?(months?|mths?|yrs?|years?)\s*(?:warranty|guarantee)|(?:warranty|guarantee)\D{0,12}(\d{1,2})\s?(months?|mths?|yrs?|years?)|^\s*(\d{1,2})\s?(months?|mths?|yrs?|years?)\s*$/i,
    scale: (m) => {
      const n = num(m[1] ?? m[3] ?? m[5]);
      return /^y/i.test(m[2] ?? m[4] ?? m[6]) ? n * 12 : n;
    }
  },
  // Bedrooms: a bedsitter or studio is 0.
  bedrooms: { spec: /bedrooms?|rooms?/i, re: /(\d)\s?-?\s?(?:bed(?:room)?s?|br|bhk)\b|\b(bed-?sitters?|studio|single room)\b/i, scale: (m) => (m[2] ? 0 : num(m[1])) },
  abv: { spec: /alcohol|abv/i, re: /(\d{1,2}(?:\.\d)?)\s?%\s?(?:abv|alc|vol|alcohol)|(?:abv|alc\.?|alcohol)\s?:?\s?(\d{1,2}(?:\.\d)?)\s?%|^\s*(\d{1,2}(?:\.\d)?)\s?%\s*$/i, scale: (m) => num(m[1] ?? m[2] ?? m[3]) },
  channels: { spec: /channels?|cameras?/i, re: /(\d{1,2})\s?-?\s?(?:ch\b|channels?|cameras?|cams?\b)/i },
  mp: { spec: /resolution|megapixel/i, re: /(\d{1,2}(?:\.\d)?)\s?(?:mp|megapixels?)\b/i },
  guests: { spec: /guests?|sleeps|occupancy|capacity/i, re: /(\d{1,2})\s?(?:guests?|people|persons?|pax|adults)\b|sleeps (\d{1,2})/i, scale: (m) => num(m[1] ?? m[2]) },
  minutes: { spec: /duration|time|length/i, re: /(\d{1,3})\s?(min|minutes?|h|hrs?|hours?)\b/i, scale: (m) => num(m[1]) * (/^h/i.test(m[2]) ? 60 : 1) },
  seats: { spec: /seats?|seater/i, re: /(\d)\s?-?\s?seater|(\d)\s?seats?/i, scale: (m) => num(m[1] ?? m[2]) },
  shoeEu: { spec: /size/i, re: /\b(3[5-9]|4[0-8])\b/ },
  hz: { spec: /refresh/i, re: /(\d{2,3})\s?hz\b/i },
  mm2: { spec: /size|gauge|cross|thickness/i, re: /(\d{1,2}(?:\.\d)?)\s?(?:mm2|mm²|sq\.? ?mm|mm)\b/i },
  feet: { spec: /length/i, re: /(\d{1,2})\s?(?:ft|feet|foot)\b/i },
  thickInch: { spec: /thick|depth|height/i, re: /(\d{1,2})\s?(?:"|”|inch(?:es)?)\b/i },
  count: { spec: /pack|pieces|count|quantity|stems|pcs|in a box/i, re: /(\d{1,3})\s?(?:pcs|pieces?|pack|pk|count|stems?|roses|pens|pencils|markers|sticks|bars|tablets)\b|(?:pack|box|set|bunch) of (\d{1,3})/i, scale: (m) => num(m[1] ?? m[2]) }
};

// Amounts as people write them, made plain before they are read: "½ kg" and "1/2 kg" are 0.5 kg, "1,000 g" is 1000 g, "half a
// kilo" is 0.5 kg. So the same size written two ways lands in the same range.
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 0.33, "⅔": 0.67, "⅛": 0.125 };
export function plainAmounts(text) {
  return String(text ?? "")
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
    .replace(/(\d+)?\s?([½¼¾⅓⅔⅛])/g, (_, whole, f) => String((whole ? Number(whole) : 0) + FRACTIONS[f]))
    .replace(/(?<![\d.])([1-9])\/([248])(?=\s?(?:kg|kilo|l\b|lt|litre|liter|"|in\b|inch))/gi, (_, a, b) => String(Number(a) / Number(b)))
    .replace(/\bhalf (?:a )?(kg|kilo)/gi, "0.5 $1")
    .replace(/\bquarter (?:a )?(kg|kilo)/gi, "0.25 $1");
}

export function readNumber(reader, product) {
  const parse = (text) => {
    const m = plainAmounts(text).match(reader.re);
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
const facet = (id, label, values) => ({ id, label, type: "choice", values });

// ---- the filters ---------------------------------------------------------------------------------------------------
export const FACETS = {
  // ---- Sound
  connectivity: facet("connectivity", "Connectivity", [choice("bluetooth", "Bluetooth", "bluetooth"), choice("wifi", "Wi-Fi", "wi-?fi|airplay|chromecast"), choice("usb", "USB", "\\busb\\b|usb-c|type-c"),
    choice("aux", "Auxiliary (3.5 mm)", "\\baux(iliary)?\\b|3\\.5 ?mm"), choice("hdmi", "HDMI", "hdmi"), choice("optical", "Optical", "optical"),
    choice("rca", "RCA", "\\brca\\b"), choice("fm", "FM radio", "\\bfm\\b"), choice("nfc", "NFC", "\\bnfc\\b"), choice("xlr", "XLR", "\\bxlr\\b")]),
  power: range("power", "Max power output", "watts", [[0, 69, "Up to 69 W"], [70, 134, "70 to 134 W"], [135, 199, "135 to 199 W"], [200, null, "200 W & above"]], "W"),
  battery: range("battery", "Battery life", "hours", [[0, 4.9, "Up to 4.9 h"], [5, 7.9, "5 to 7.9 h"], [8, 10.9, "8 to 10.9 h"], [11, 13.9, "11 to 13.9 h"], [14, null, "14 h & above"]], "h"),
  water: facet("water", "Water resistance", [choice("waterproof", "Waterproof (IP67, IP68)", "ip6[78]|ipx[78]|waterproof"), choice("resistant", "Water resistant (IPX4 to IPX6)", "ipx[4-6]|ip[56][4-6]|splash|water resistant"),
    choice("none", "Not water resistant", "mains \\(plug-in\\)|not water")]),
  audioOutput: facet("audioOutput", "Audio output mode", [choice("mono", "Mono", "\\bmono\\b"), choice("stereo", "Stereo", "stereo"), choice("surround", "Surround", "surround|5\\.1|7\\.1|dolby atmos")]),
  speakerType: facet("speakerType", "Speaker type", [choice("portable", "Portable", "portable|pocket|compact|strap"), choice("party", "Party speaker", "party speaker|partybox|boombox|light show|karaoke"), choice("soundbar", "Soundbar", "sound ?bar"),
    choice("hometheatre", "Home theatre", "home theat|2\\.1|5\\.1|subwoofer"), choice("home", "Home speaker", "home speaker|bookshelf|mains")]),
  powerSource: facet("powerSource", "Power source", [choice("battery", "Battery / rechargeable", "battery|playtime|power ?bank|rechargeable"), choice("mains", "Mains (plug-in)", "mains|plug-in|plugs into"), choice("solar", "Solar", "\\bsolar\\b")]),
  headphoneType: facet("headphoneType", "Headphone type", [choice("earbuds", "True wireless earbuds", "earbud|true wireless|tws|airpod"), choice("overear", "Over-ear", "over-?ear|headphone"), choice("neckband", "Neckband", "neckband"), choice("wired", "Wired earphones", "wired|earphone")]),
  noiseCancel: facet("noiseCancel", "Noise cancelling", [choice("anc", "Active noise cancelling", "noise cancell?ing|\\banc\\b"), choice("enc", "Call noise reduction", "\\benc\\b|call noise")]),
  // ---- Screens
  screen: range("screen", "Screen size", "inches", [[0, 32, "Up to 32 in"], [33, 43, "33 to 43 in"], [44, 55, "44 to 55 in"], [56, 65, "56 to 65 in"], [66, null, "66 in & above"]], "in"),
  phoneScreen: range("phoneScreen", "Screen size", "smallInches", [[0, 5.9, "Up to 5.9 in"], [6, 6.4, "6 to 6.4 in"], [6.5, 6.9, "6.5 to 6.9 in"], [7, null, "7 in & above"]], "in"),
  tabletScreen: range("tabletScreen", "Screen size", "smallInches", [[0, 8.9, "Up to 8.9 in"], [9, 10.9, "9 to 10.9 in"], [11, null, "11 in & above"]], "in"),
  laptopScreen: range("laptopScreen", "Screen size", "smallInches", [[0, 13.9, "Up to 13.9 in"], [14, 14.9, "14 in"], [15, 15.9, "15 to 15.6 in"], [16, null, "16 in & above"]], "in"),
  monitorSize: range("monitorSize", "Screen size", "inches", [[0, 21.9, "Up to 21.9 in"], [22, 24.9, "22 to 24 in"], [25, 27.9, "27 in"], [28, null, "28 in & above"]], "in"),
  resolution: facet("resolution", "Resolution", [choice("8k", "8K", "\\b8k\\b"), choice("4k", "4K UHD", "\\b4k\\b|uhd|2160"), choice("qhd", "QHD (1440p)", "\\bqhd\\b|1440|2k\\b"), choice("fhd", "Full HD", "full hd|fhd|1080"), choice("hd", "HD", "\\bhd ready\\b|\\b720p?\\b|(?<!full |ultra |uhd |fhd )\\bhd\\b(?! ready)")]),
  refreshRate: range("refreshRate", "Refresh rate", "hz", [[0, 75, "60 to 75 Hz"], [76, 144, "100 to 144 Hz"], [145, null, "165 Hz & above"]], "Hz"),
  panel: facet("panel", "Panel type", [choice("ips", "IPS", "\\bips\\b"), choice("va", "VA", "\\bva\\b"), choice("tn", "TN", "\\btn\\b"), choice("oled", "OLED", "oled|amoled"), choice("curved", "Curved", "curved")]),
  monitorPorts: facet("monitorPorts", "Ports", [choice("hdmi", "HDMI", "hdmi"), choice("vga", "VGA", "\\bvga\\b"), choice("dp", "DisplayPort", "displayport|\\bdp\\b"), choice("usbc", "USB-C", "usb-?c|type-?c")]),
  smartPlatform: facet("smartPlatform", "Smart TV platform", [choice("android", "Android TV / Google TV", "android tv|google tv"), choice("vidaa", "VIDAA", "vidaa"), choice("webos", "webOS", "webos"), choice("tizen", "Tizen", "tizen"), choice("none", "Not smart", "not smart|digital tv")]),
  // ---- Phones and computers
  storage: range("storage", "Storage", "gb", [[0, 32, "Up to 32 GB"], [33, 64, "64 GB"], [65, 128, "128 GB"], [129, 256, "256 GB"], [257, 512, "512 GB"], [513, null, "1 TB & above"]]),
  ram: range("ram", "RAM", "ramGb", [[0, 3, "Up to 3 GB"], [4, 4, "4 GB"], [5, 6, "6 GB"], [7, 8, "8 GB"], [9, 12, "12 GB"], [13, null, "16 GB & above"]]),
  network: facet("network", "Network", [choice("5g", "5G", "\\b5g\\b"), choice("4g", "4G LTE", "\\b4g\\b|lte"), choice("3g", "3G", "\\b3g\\b")]),
  dualSim: facet("dualSim", "SIM", [choice("dual", "Dual SIM", "dual ?sim|2 sim"), choice("esim", "eSIM", "\\besim\\b")]),
  os: facet("os", "Operating system", [choice("android", "Android", "android"), choice("ios", "iOS / iPadOS", "iphone|ipad|ios\\b|apple"), choice("windows", "Windows", "windows"), choice("macos", "macOS", "macbook|macos"), choice("chrome", "ChromeOS", "chromebook|chromeos")]),
  processor: facet("processor", "Processor", [choice("i3", "Intel Core i3", "core i3|\\bi3\\b"), choice("i5", "Intel Core i5", "core i5|\\bi5\\b"), choice("i7", "Intel Core i7", "core i7|\\bi7\\b"), choice("celeron", "Intel Celeron / Pentium", "celeron|pentium"), choice("ryzen", "AMD Ryzen", "ryzen"), choice("apple", "Apple M series", "\\bm[1-4]\\b")]),
  diskType: facet("diskType", "Storage type", [choice("ssd", "SSD", "\\bssd\\b|nvme"), choice("hdd", "Hard disk (HDD)", "\\bhdd\\b|hard ?disk")]),
  connector: facet("connector", "Connector type", [choice("usbc", "USB Type-C", "usb-?c|type-?c"), choice("lightning", "Lightning", "lightning|iphone"), choice("micro", "Micro USB", "micro ?usb"), choice("usba", "USB Type-A", "usb-?a\\b|usb 3\\.0|usb 2\\.0")]),
  accessoryType: facet("accessoryType", "Accessory", [opt("case", "Cases and covers", "case|cover|pouch"), opt("protector", "Screen protectors", "screen protector|tempered glass|glass protector"), opt("charger", "Chargers", "charger|charging adapter|wall adapter|car charger"),
    opt("cable", "Cables", "cable|cord"), opt("powerbank", "Power banks", "power ?bank"), opt("holder", "Holders and stands", "holder|stand|mount|ring light|selfie stick|tripod")]),
  fitsPhone: facet("fitsPhone", "Fits phone", [choice("iphone", "iPhone", "iphone"), choice("samsung", "Samsung", "samsung|galaxy"), choice("tecno", "Tecno", "tecno"), choice("infinix", "Infinix", "infinix"), choice("itel", "itel", "\\bitel\\b"),
    choice("xiaomi", "Xiaomi / Redmi", "xiaomi|redmi|poco"), choice("oppo", "Oppo / Realme", "oppo|realme"), choice("universal", "Any phone (universal)", "universal|all phones")]),
  chargerPower: range("chargerPower", "Charging power", "watts", [[0, 20, "Up to 20 W"], [21, 45, "21 to 45 W"], [46, 65, "46 to 65 W"], [66, null, "66 W & above"]], "W"),
  capacityMah: range("capacityMah", "Battery capacity", "mah", [[0, 9999, "Up to 9,999 mAh"], [10000, 19999, "10,000 to 19,999 mAh"], [20000, null, "20,000 mAh & above"]], "mAh"),
  cableLength: range("cableLength", "Cable length", "metres", [[0, 1, "Up to 1 m"], [1.01, 2, "1 to 2 m"], [2.01, null, "Over 2 m"]], "m"),
  computerAccessory: facet("computerAccessory", "Accessory", [opt("keyboard", "Keyboards", "keyboard"), opt("mouse", "Mice", "mouse|mice"), opt("router", "Routers and Wi-Fi", "router|mifi|extender|access point|modem"),
    opt("webcam", "Webcams", "webcam"), opt("charger", "Laptop chargers", "laptop charger|adapter|charger"), opt("bag", "Laptop bags", "laptop bag|sleeve"), opt("ups", "UPS and surge", "ups|surge|stabili[sz]er"), opt("hub", "Hubs and adapters", "hub|dongle|converter")]),
  wireless: facet("wireless", "Connection", [choice("wireless", "Wireless", "wireless|2\\.4 ?ghz|bluetooth"), choice("wired", "Wired", "\\bwired\\b|usb cable")]),
  storageDevice: facet("storageDevice", "Type", [opt("flash", "USB flash disks", "flash ?disk|flash drive|pen ?drive|usb drive|usb stick"), opt("microsd", "MicroSD cards", "micro ?sd|tf card"), opt("sd", "SD cards", "sd card"),
    opt("ssd", "External SSDs", "portable ssd|external ssd|ssd"), opt("hdd", "External hard disks", "hard ?disk|external hdd|hdd")]),
  usbVersion: facet("usbVersion", "USB", [choice("usb3", "USB 3.0 or faster", "usb ?3|3\\.[0-2]|3\\.1|3\\.2"), choice("usb2", "USB 2.0", "usb ?2\\.0"), choice("usbc", "USB-C", "usb-?c|type-?c|dual drive|otg")]),
  printerType: facet("printerType", "Printer type", [choice("inktank", "Ink tank", "ink ?tank|ecotank|smart tank"), choice("inkjet", "Inkjet", "inkjet|deskjet"), choice("laser", "Laser", "laser"), choice("thermal", "Receipt / thermal", "thermal|receipt")]),
  printerFunctions: facet("printerFunctions", "Can do", [choice("aio", "Print, scan and copy", "all-in-one|all in one|print, scan|scan and copy|3 in 1|3-in-1"), choice("wifi", "Wi-Fi printing", "wi-?fi|wireless"), choice("colour", "Colour printing", "colou?r"), choice("duplex", "Prints both sides", "duplex|two-sided|both sides")]),
  inkType: facet("inkType", "Supplies", [opt("ink", "Ink bottles and cartridges", "ink|cartridge"), opt("toner", "Toner", "toner"), opt("paper", "Paper", "paper|ream")]),
  // ---- Appliances
  applianceType: facet("applianceType", "Appliance", [opt("microwave", "Microwaves", "microwave"), opt("fridge", "Fridges and freezers", "fridge|refrigerator|freezer"), opt("cooker", "Cookers and ovens", "cooker|oven|hot ?plate|gas stove"),
    opt("kettle", "Kettles", "kettle"), opt("blender", "Blenders and mixers", "blender|mixer|juicer|food processor"), opt("iron", "Irons", "iron box|flat iron|steam iron"), opt("washer", "Washing machines", "washing machine|washer"),
    opt("fan", "Fans and heaters", "fan|heater"), opt("dispenser", "Water dispensers", "water dispenser|dispenser"), opt("airfryer", "Air fryers and toasters", "air ?fryer|deep fryer|toaster|sandwich maker"), opt("tv", "TVs", "tv")]),
  applianceFeature: facet("applianceFeature", "Features", [choice("grill", "Grill", "grill"), choice("convection", "Convection", "convection"), choice("digital", "Digital controls", "digital|touch"), choice("defrost", "Defrost", "defrost|frost[- ]free"),
    choice("inverter", "Inverter (saves power)", "inverter"), choice("steam", "Steam", "steam")]),
  applianceCapacity: range("applianceCapacity", "Capacity", "litres", [[0, 2, "Up to 2 L"], [2.01, 25, "2 to 25 L"], [25.01, 100, "26 to 100 L"], [100.01, 250, "101 to 250 L"], [250.01, null, "Over 250 L"]], "L"),
  appliancePower: range("appliancePower", "Power", "watts", [[0, 800, "Up to 800 W"], [801, 1500, "801 to 1,500 W"], [1501, 2200, "1,501 to 2,200 W"], [2201, null, "Over 2,200 W"]], "W"),
  // ---- Lighting and power
  lightType: facet("lightType", "Light", [opt("bulb", "Bulbs", "bulb"), opt("tube", "Tube lights", "tube|t8|batten"), opt("flood", "Floodlights and security", "flood ?light|security light|street light"), opt("strip", "LED strips", "strip"),
    opt("fitting", "Ceiling and wall fittings", "ceiling|wall light|chandelier|fitting|downlight|panel light"), opt("lamp", "Lamps", "lamp"), opt("torch", "Torches and lanterns", "torch|lantern|flashlight")]),
  lightBase: facet("lightBase", "Bulb base", ["E27", "E14", "B22", "GU10", "MR16"].map((b) => choice(b.toLowerCase(), b, `\\b${b}\\b`))),
  lightColour: facet("lightColour", "Light colour", [choice("warm", "Warm white", "warm|3000 ?k|2700 ?k"), choice("cool", "Cool white", "cool white|4000 ?k"), choice("daylight", "Daylight", "daylight|6500 ?k"), choice("rgb", "Colour changing (RGB)", "\\brgb\\b|colou?r changing")]),
  lampPower: range("lampPower", "Wattage", "watts", [[0, 9, "Up to 9 W"], [10, 20, "10 to 20 W"], [21, 50, "21 to 50 W"], [51, null, "Over 50 W"]], "W"),
  batterySize: facet("batterySize", "Battery size", ["AA", "AAA", "C", "D", "9V", "CR2032"].map((b) => choice(b.toLowerCase(), b, `\\b${b}\\b`))),
  chemistry: facet("chemistry", "Chemistry", [choice("alkaline", "Alkaline", "alkaline"), choice("lithium", "Lithium", "lithium|li-?ion|lifepo4"), choice("rechargeable", "Rechargeable", "rechargeable|nimh"), choice("leadacid", "Lead acid / gel", "lead acid|\\bgel\\b|car battery|deep cycle")]),
  batteryUse: facet("batteryUse", "For", [choice("household", "Remotes and torches", "\\baa\\b|\\baaa\\b|remote|torch|household"), choice("solar", "Solar and inverter", "solar|inverter|deep cycle"), choice("car", "Cars", "car battery|\\bn\\d{2,3}\\b|vehicle"), choice("ups", "UPS", "\\bups\\b")]),
  // ---- Clothes, shoes and accessories
  garment: facet("garment", "Clothing", [opt("dress", "Dresses", "dress|gown|maxi"), opt("shirt", "Shirts", "shirt|polo"), opt("tshirt", "T-shirts", "t-?shirt|tee"), opt("blouse", "Blouses and tops", "blouse|top|crop top"),
    opt("trousers", "Trousers and jeans", "trouser|jean|chino|pant|khaki"), opt("skirt", "Skirts", "skirt"), opt("jacket", "Jackets and coats", "jacket|coat|blazer|hoodie|sweater|cardigan|jumper"), opt("suit", "Suits", "suit|two-piece|three-piece"),
    opt("traditional", "Kitenge and traditional", "kitenge|ankara|kanzu|dashiki|kikoi|leso|abaya|kaftan"), choice("shorts", "Shorts", "\\bshorts\\b"), opt("uniform", "Uniforms", "uniform"), opt("underwear", "Underwear and socks", "underwear|boxer|bra|panty|panties|socks?|vest")]),
  clothingSize: { ...facet("clothingSize", "Size", ["XS", "S", "M", "L", "XL", "XXL", "3XL"].map((z) => choice(z.toLowerCase(), z, `(?:^|[^a-z])${z}(?:$|[^a-z])`))), sizes: true },
  sleeve: facet("sleeve", "Sleeve", [choice("long", "Long sleeve", "long[- ]sleeve"), choice("short", "Short sleeve", "short[- ]sleeve"), choice("none", "Sleeveless", "sleeveless")]),
  fit: facet("fit", "Fit", [choice("slim", "Slim", "slim"), choice("regular", "Regular", "regular fit"), choice("loose", "Loose / oversized", "loose|oversized|relaxed")]),
  fabric: facet("fabric", "Fabric", [choice("cotton", "Cotton", "cotton"), choice("denim", "Denim", "denim|jeans"), choice("ankara", "Ankara / kitenge", "ankara|kitenge"), choice("linen", "Linen", "linen"),
    choice("polyester", "Polyester", "polyester"), choice("silk", "Silk / satin", "silk|satin|chiffon"), choice("wool", "Wool / knit", "wool|knit|sweater"), choice("lace", "Lace", "\\blace\\b"), choice("velvet", "Velvet", "velvet")]),
  occasion: facet("occasion", "Occasion", [choice("official", "Office and official", "official|office|formal|work"), choice("casual", "Casual", "casual|everyday|weekend"), choice("party", "Party and evening", "party|evening|cocktail|wedding guest"),
    choice("traditional", "Traditional and cultural", "traditional|cultural|kitenge|ankara|dashiki"), choice("school", "School", "school")]),
  gender: facet("gender", "For", [choice("women", "Women", "women|ladies|lady|female|\\bher\\b"), choice("men", "Men", "\\bmen\\b|men's|gents|male|\\bhis\\b"), choice("kids", "Kids", "kid|child|boys|girls|school|baby"), choice("unisex", "Unisex", "unisex")]),
  shoeSize: range("shoeSize", "Shoe size (EU)", "shoeEu", [[35, 37, "EU 35 to 37"], [38, 40, "EU 38 to 40"], [41, 43, "EU 41 to 43"], [44, null, "EU 44 & above"]]),
  shoeType: facet("shoeType", "Style", [choice("sneakers", "Sneakers", "sneaker|trainer|rubber shoe"), choice("official", "Official", "official|oxford|loafer|brogue"), choice("sandals", "Sandals", "sandal|slipper|flip"), choice("heels", "Heels", "heel"), choice("boots", "Boots", "boot"), choice("school", "School shoes", "school shoe")]),
  material: facet("material", "Material", [choice("leather", "Leather", "leather"), choice("canvas", "Canvas", "canvas"), choice("suede", "Suede", "suede"), choice("wood", "Wood", "wood|mahogany|mvule|pine|cypress|oak|mninga|teak"),
    choice("metal", "Metal", "metal|steel|iron|alumin"), choice("plastic", "Plastic", "plastic|pvc|abs"), choice("fabric", "Fabric", "fabric|velvet|cotton|upholster"), choice("glass", "Glass", "\\bglass\\b"), choice("mdf", "MDF / board", "\\bmdf\\b|chipboard|particle board")]),
  bagType: facet("bagType", "Bag", [opt("handbag", "Handbags", "handbag|tote|clutch|shoulder bag|sling"), opt("backpack", "Backpacks", "backpack|school bag|rucksack"), opt("travel", "Suitcases and travel", "suitcase|trolley|travel bag|duffel|luggage"),
    opt("wallet", "Wallets and purses", "wallet|purse|card holder"), opt("laptop", "Laptop bags", "laptop bag")]),
  jewelleryType: facet("jewelleryType", "Jewellery", [opt("necklace", "Necklaces and chains", "necklace|chain|pendant"), opt("bracelet", "Bracelets and bangles", "bracelet|bangle|anklet"), opt("earrings", "Earrings", "earring|stud|hoop"),
    opt("ring", "Rings", "ring"), opt("watch", "Watches", "watch"), opt("set", "Jewellery sets", "jewellery set|jewelry set")]),
  metal: facet("metal", "Metal", [choice("gold", "Gold", "gold"), choice("silver", "Silver", "silver|925"), choice("steel", "Stainless steel", "stainless"), choice("brass", "Brass / fashion", "brass|fashion|plated")]),
  purity: facet("purity", "Purity", ["24K", "22K", "18K", "14K", "925"].map((k) => choice(k.toLowerCase(), k === "925" ? "Sterling 925" : k, `\\b${k}\\b`))),
  watchType: facet("watchType", "Watch", [choice("smart", "Smart watches", "smart ?watch|fitness band|smart band"), choice("analog", "Analogue", "analog|quartz|automatic"), choice("digital", "Digital", "digital watch|casio")]),
  eyewearType: facet("eyewearType", "Eyewear", [opt("sunglasses", "Sunglasses", "sunglass|shades"), opt("frames", "Spectacle frames", "frame|spectacle|eyeglass"), opt("reading", "Reading glasses", "reading glass"), opt("lenses", "Lenses", "lens|contact")]),
  lensFeature: facet("lensFeature", "Lenses", [choice("uv", "UV protection", "uv ?400|uv protect"), choice("polarized", "Polarised", "polari[sz]ed"), choice("bluelight", "Blue light filter", "blue ?light|anti-?glare|computer glass"), choice("photochromic", "Photochromic", "photochromic|transition")]),
  fashionAccessory: facet("fashionAccessory", "Accessory", [opt("belt", "Belts", "belt"), opt("hat", "Hats and caps", "hat|cap|beanie|marvin"), opt("scarf", "Scarves and shawls", "scarf|shawl|stole|bandana|headwrap|head wrap"), opt("tie", "Ties", "tie|bow tie"), opt("gloves", "Gloves", "glove")]),
  // ---- Tailoring and repairs
  garmentMade: facet("garmentMade", "What is made", [opt("dress", "Dresses and gowns", "dress|gown"), opt("suit", "Suits", "suit|two-piece|three-piece|blazer"), opt("shirt", "Shirts and blouses", "shirt|blouse"),
    opt("trousers", "Trousers", "trouser|jean"), opt("traditional", "Kitenge and traditional", "kitenge|ankara|kanzu|dashiki"), opt("uniform", "School and work uniforms", "uniform"), opt("kids", "Kids' outfits", "kids?|children"),
    opt("alteration", "Alterations and repairs", "alteration|repair|hemming|resize|take in|zip")]),
  turnaround: facet("turnaround", "Ready in", [choice("sameday", "Same day / while you wait", "same day|while you wait|express|within (?:an|1|2|3) hours?|\\b[1-3] ?hours?\\b"), choice("days", "1 to 3 days", "\\b[1-3] ?(?:-|to) ?[2-3] days|next day|24 hours|48 hours|\\b[1-3] days?\\b"),
    choice("week", "Within a week", "\\b[4-7] ?(?:-|to)? ?\\d? ?days|within a week|one week|1 week")]),
  fabricSupply: facet("fabricSupply", "Fabric", [choice("bring", "Bring your own fabric", "bring (?:your|own)|your (?:own )?fabric|own fabric"), choice("included", "Fabric included", "fabric included|includes fabric|with fabric|we supply")]),
  repairDevice: facet("repairDevice", "Repairs", [opt("phone", "Phones", "phone|screen replacement|charging port"), opt("laptop", "Laptops and computers", "laptop|computer|pc"), opt("tv", "TVs and sound", "tv|television|speaker|radio"),
    opt("appliance", "Appliances", "fridge|cooker|microwave|washing machine|appliance"), opt("shoes", "Shoes and bags", "shoe|sole|heel|bag|zip")]),
  repairType: facet("repairType", "Repair", [choice("screen", "Screen", "screen|display|glass"), choice("battery", "Battery", "battery"), choice("charging", "Charging port", "charging|port"), choice("software", "Software and unlocking", "software|unlock|flash|virus|install"),
    choice("water", "Water damage", "water damage"), choice("service", "Service and cleaning", "service|clean|servicing"), choice("sole", "Soles and heels", "sole|heel|stitch"), choice("polish", "Polish and shine", "polish|shine")]),
  // ---- Beauty, hair and wellness
  concentration: facet("concentration", "Concentration", [choice("parfum", "Parfum", "\\bparfum\\b|extrait"), choice("edp", "Eau de parfum", "eau de parfum|\\bedp\\b"), choice("edt", "Eau de toilette", "eau de toilette|\\bedt\\b"), choice("spray", "Body spray / mist", "body spray|mist|deodorant"), choice("oil", "Perfume oil / oud", "\\boil\\b|oud|attar")]),
  scentFor: facet("scentFor", "For", [choice("women", "Women", "women|ladies|her\\b"), choice("men", "Men", "\\bmen\\b|men's|him\\b"), choice("unisex", "Unisex", "unisex")]),
  volumeMl: range("volumeMl", "Volume", "ml", [[0, 30, "Up to 30 ml"], [31, 60, "31 to 60 ml"], [61, 100, "61 to 100 ml"], [101, null, "Over 100 ml"]], "ml"),
  authenticity: facet("authenticity", "Authenticity", [choice("original", "Original", "original|genuine|authentic"), choice("inspired", "Inspired by", "inspired|impression|dupe")]),
  beautyType: facet("beautyType", "Product", [opt("skincare", "Skin care", "lotion|cream|serum|moisturi[sz]er|sunscreen|cleanser|toner|face wash|body oil|petroleum jelly"), opt("makeup", "Makeup", "makeup|lipstick|foundation|powder|mascara|eyeliner|lip gloss|concealer|eyeshadow"),
    opt("hair", "Hair care", "shampoo|conditioner|hair oil|hair food|relaxer|gel|treatment|leave-in"), opt("wigs", "Wigs, weaves and braids", "wig|weave|braid|extension|kinky|attachment|crochet"),
    opt("nails", "Nails", "nail|polish|press-on"), opt("soap", "Soaps and bath", "soap|body wash|shower gel|bath"), opt("men", "Men's grooming", "beard|shaving|aftershave|clipper|trimmer")]),
  skinType: facet("skinType", "Skin type", [choice("dry", "Dry skin", "dry skin"), choice("oily", "Oily skin", "oily"), choice("sensitive", "Sensitive skin", "sensitive"), choice("all", "All skin types", "all skin")]),
  barberService: facet("barberService", "Service", [opt("haircut", "Haircuts", "haircut|cut|crew cut|chiskop|clean shave head"), opt("fade", "Fades", "fade|taper"), opt("beard", "Beard trims and shaping", "beard|line-?up|edge"),
    opt("shave", "Shaves", "shave"), opt("dye", "Hair dye", "dye|colou?r"), opt("locs", "Dreadlocks", "dread|loc|retwist"), opt("kids", "Kids' cuts", "kids? cut|child"), opt("treatment", "Scalp treatments and massage", "scalp|massage|treatment|steam")]),
  salonService: facet("salonService", "Service", [opt("braids", "Braids and cornrows", "braid|cornrow|knotless|twist|lines"), opt("wig", "Wigs and weaves", "wig|weave|sew-?in|frontal|closure"), opt("hair", "Wash, blow-dry and styling", "wash|blow-?dry|silk press|styling|set|retouch"),
    opt("relaxer", "Relaxer and treatment", "relaxer|treatment|steam|keratin|colou?r|dye"), opt("nails", "Nails", "manicure|pedicure|gel|acrylic|nail"), opt("makeup", "Makeup and lashes", "makeup|lash|brow|wax"), opt("facial", "Facials", "facial")]),
  massageType: facet("massageType", "Treatment", [choice("swedish", "Swedish / relaxing", "swedish|relax"), choice("deep", "Deep tissue", "deep tissue"), choice("hotstone", "Hot stone", "hot stone"), choice("aroma", "Aromatherapy", "aroma"),
    choice("reflexology", "Foot reflexology", "reflexology|foot"), choice("sports", "Sports massage", "sports"), choice("couples", "Couples", "couple"), choice("facial", "Facials and body scrubs", "facial|scrub|wrap|sauna|steam")]),
  serviceFor: facet("serviceFor", "For", [choice("women", "Women", "women|ladies|braid|weave|manicure|pedicure"), choice("men", "Men", "\\bmen\\b|men's|beard|shave|fade"), choice("kids", "Kids", "kid|child"), choice("couples", "Couples", "couple")]),
  homeService: facet("homeService", "Where", [choice("home", "Comes to you (home service)", "home service|at home|house call|home visit|we come|comes to you|mobile (?:service|barber|salon|spa|wash)|in-?home|to your (?:home|door|office)"),
    choice("shop", "At the shop", "walk-?in|in (?:the )?(?:shop|salon|spa|studio)")]),
  booking: facet("booking", "Booking", [choice("walkin", "Walk-in", "walk-?in"), choice("appointment", "Appointment", "appointment|booking|book ")]),
  duration: range("duration", "Duration", "minutes", [[0, 30, "Up to 30 min"], [31, 60, "31 to 60 min"], [61, 120, "1 to 2 hours"], [121, null, "Over 2 hours"]]),
  membership: facet("membership", "Pass", [opt("day", "Day pass", "day pass|daily|drop-?in|single session"), opt("week", "Weekly", "week|weekly"), opt("month", "Monthly", "month|monthly"), opt("quarter", "Quarterly", "quarter|3 months?"),
    opt("year", "Annual", "annual|year|12 months?"), opt("pt", "Personal training", "personal train|trainer|pt session"), opt("class", "Classes", "class|aerobics|zumba|yoga|spinning|boxing")]),
  membershipFor: facet("membershipFor", "Who", [choice("student", "Students", "student"), choice("couples", "Couples", "couple"), choice("corporate", "Corporate / group", "corporate|group|family")]),
  // ---- Food and drink
  drinkType: facet("drinkType", "Drink", [opt("soda", "Soda and soft drinks", "soda|soft drink|coke|coca-?cola|fanta|sprite|pepsi|mirinda|krest|stoney|novida|7up|schweppes|minute maid"),
    opt("juice", "Juice", "juice|smoothie|fresh passion|mango juice|afia|pick n peel"), opt("energy", "Energy drinks", "energy drink|red bull|monster|predator|power play|sting"),
    opt("water", "Bottled water", "bottled water|mineral water|dasani|keringet|aquamist|highlands water"), opt("dairy", "Milk and yoghurt", "milk|yoghurt|yogurt|mala|lala|maziwa"),
    opt("hot", "Tea, coffee and cocoa", "tea|coffee|cocoa|drinking chocolate|milo"), opt("cordial", "Squash and cordial", "squash|cordial|quencher")]),
  drinkSize: range("drinkSize", "Size", "litres", [[0, 0.35, "Up to 350 ml"], [0.351, 0.6, "351 to 600 ml"], [0.601, 1, "1 litre"], [1.001, 2.25, "1.25 to 2.25 L"], [2.251, null, "Over 2.25 L"]]),
  drinkPack: facet("drinkPack", "Pack", [choice("single", "Single bottle or can", "^(?!.*(?:crate|carton|\\d+ ?-?pack|pack of|case of)).*(?:single|\\bbottle\\b|\\bcan\\b|each)"), choice("pack", "6-pack and 12-pack", "6 ?-?pack|12 ?-?pack|pack of (?:6|12)|six pack"), choice("crate", "Crate (24) and carton", "crate|carton|24 ?pack|pack of 24|case of")]),
  liquorType: facet("liquorType", "Drink", [opt("beer", "Beer and cider", "beer|lager|stout|tusker|guinness|pilsner|white cap|balozi|cider|savanna|hunters"), opt("wine", "Wine", "wine|merlot|cabernet|sauvignon|sweet red|4th street|four cousins"),
    opt("whisky", "Whisky", "whisky|whiskey|johnnie walker|jameson|black & white|grant"), opt("vodka", "Vodka", "vodka|smirnoff|kenya king|chrome"), opt("gin", "Gin", "gin|gilbey|gordon"),
    opt("brandy", "Brandy and cognac", "brandy|cognac|viceroy|richot"), opt("rum", "Rum", "rum|captain morgan"), opt("liqueur", "Liqueur and cream", "liqueur|amarula|baileys|cream liqueur")]),
  bottleSize: range("bottleSize", "Bottle size", "litres", [[0, 0.25, "Up to 250 ml"], [0.251, 0.5, "251 to 500 ml"], [0.501, 0.75, "750 ml"], [0.751, null, "1 litre & above"]]),
  bakeType: facet("bakeType", "Baked goods", [opt("bread", "Bread", "bread|loaf|bun|baguette|brown bread|white bread"), opt("cake", "Cakes", "cake|black forest|red velvet"), opt("cupcake", "Cupcakes and muffins", "cupcake|muffin"),
    opt("pastry", "Pastries and doughnuts", "pastry|pastries|doughnut|donut|croissant|samosa|sausage roll|meat pie"), opt("mandazi", "Mandazi and chapati", "mandazi|chapati|maandazi"), opt("cookies", "Cookies and biscuits", "cookie|biscuit|shortbread")]),
  breadType: facet("breadType", "Bread", [choice("white", "White", "white bread|white"), choice("brown", "Brown", "brown"), choice("wholemeal", "Wholemeal / multigrain", "whole ?meal|whole ?wheat|multigrain|seeded")]),
  flavour: facet("flavour", "Flavour", [choice("vanilla", "Vanilla", "vanilla"), choice("chocolate", "Chocolate", "chocolate|cocoa"), choice("redvelvet", "Red velvet", "red velvet"), choice("blackforest", "Black forest", "black forest"),
    choice("fruit", "Fruit", "fruit|lemon|orange|strawberry|banana|passion|mango"), choice("caramel", "Caramel", "caramel|toffee"), choice("marble", "Marble", "marble")]),
  cakeOccasion: facet("cakeOccasion", "Occasion", [choice("birthday", "Birthday", "birthday"), choice("wedding", "Wedding", "wedding|engagement|ruracio"), choice("graduation", "Graduation", "graduation"), choice("baby", "Baby shower and christening", "baby|christening|gender reveal")]),
  cuisine: facet("cuisine", "Cuisine", [choice("kenyan", "Kenyan", "ugali|sukuma|chapati|githeri|mukimo|matoke|nyama choma|mandazi|kienyeji|beans|tilapia|omena|kenyan"), choice("swahili", "Swahili / coast", "pilau|biryani|samaki wa kupaka|wa kupaka|viazi karai|mahamri|swahili|coast|coconut"),
    choice("indian", "Indian", "biryani|curry|masala|tikka|naan|samosa"), choice("fastfood", "Fast food", "burger|chips|fries|pizza|sausage|smokie|shawarma|fried chicken|hot dog"), choice("chinese", "Chinese", "chinese|noodle|fried rice|stir[- ]fry"),
    choice("breakfast", "Breakfast and tea", "breakfast|chai|tea|coffee|eggs|pancake|toast")]),
  protein: facet("protein", "Main", [opt("beef", "Beef", "beef|nyama|steak|burger"), opt("chicken", "Chicken", "chicken|kuku"), opt("goat", "Goat and mutton", "goat|mbuzi|mutton|lamb"), opt("fish", "Fish and seafood", "fish|samaki|tilapia|omena|prawn|seafood"),
    opt("pork", "Pork", "pork|bacon|ham"), opt("veg", "Vegetarian", "beans|vegetable|veg|lentil|ndengu|githeri|veggie|mboga")]),
  portion: facet("portion", "Portion", [opt("half", "Half plate / small", "half plate|half|small|kids?|1/2"), opt("full", "Full plate / regular", "full plate|full|regular|plate"), opt("sharing", "Sharing / family", "sharing|family|platter|for (?:2|two|4|four)|large|kilo")]),
  mealTime: facet("mealTime", "Meal", [choice("breakfast", "Breakfast", "breakfast|chai|tea|mandazi|eggs"), choice("lunch", "Lunch and dinner", "lunch|dinner|plate|pilau|biryani|ugali|rice|chips"), choice("snack", "Snacks", "snack|samosa|smokie|bhajia|chips")]),
  meatType: facet("meatType", "Meat", [opt("beef", "Beef", "beef|steak|mince"), opt("goat", "Goat", "goat|mbuzi"), opt("mutton", "Mutton and lamb", "mutton|lamb"), opt("chicken", "Chicken", "chicken|kienyeji|broiler"),
    opt("pork", "Pork", "pork|bacon"), opt("fish", "Fish", "fish|tilapia|omena|nile perch|samaki"), opt("sausage", "Sausages and smokies", "sausage|smokie|bacon")]),
  cut: facet("cut", "Cut", [choice("withbone", "With bone", "with bone|bone-?in|on the bone"), choice("boneless", "Boneless / steak", "boneless|steak|fillet|topside"), choice("mince", "Mince", "mince|minced"), choice("ribs", "Ribs and chops", "ribs?|chops?"),
    choice("roast", "Roast / ready to eat", "roast|choma|fried|grilled|cooked")]),
  produceType: facet("produceType", "Fresh", [opt("fruit", "Fruit", "fruit|banana|mango|orange|apple|avocado|pawpaw|pineapple|watermelon|passion|lemon"), opt("veg", "Vegetables", "tomato|onion|sukuma|kale|cabbage|spinach|carrot|potato|pepper|managu|terere|veg"),
    opt("herbs", "Herbs and spices", "dhania|coriander|garlic|ginger|chilli|herb"), opt("eggs", "Eggs", "egg")]),
  soldBy: facet("soldBy", "Sold by", [choice("kg", "Per kg", "per kg|/kg|a kilo|per kilo"), choice("bunch", "Bunch", "bunch"), choice("piece", "Per piece", "per piece|each|per head"), choice("tray", "Tray / crate", "tray|crate|box")]),
  groceryType: facet("groceryType", "Groceries", [opt("flour", "Flour and unga", "flour|unga|atta|maize meal|wheat"), opt("sugar", "Sugar", "sugar"), opt("salt", "Salt", "salt"), opt("rice", "Rice and pasta", "rice|pasta|spaghetti|noodle|macaroni"),
    opt("oil", "Cooking oil and fat", "cooking oil|oil|cooking fat|kimbo|ghee"), opt("tea", "Tea and coffee", "tea leaves|tea|coffee|cocoa|milo"), opt("spice", "Spices and sauces", "spice|masala|royco|curry|ketchup|sauce|stock|mchuzi"),
    opt("cereal", "Cereals and porridge", "cereal|cornflakes|oats|porridge|weetabix|uji"), opt("dairy", "Milk, butter and cheese", "milk|butter|cheese|margarine|blue band"), opt("snack", "Snacks and biscuits", "biscuit|crisps|snack|nuts|popcorn"),
    opt("household", "Cleaning and household", "detergent|soap|bleach|tissue|toilet paper|dishwash|omo|ariel|sunlight|jik|matches")]),
  packWeight: range("packWeight", "Pack size", "kg", [[0, 0.25, "Up to 250 g"], [0.251, 0.5, "251 to 500 g"], [0.501, 1, "1 kg"], [1.001, 2, "2 kg"], [2.001, 5, "2 to 5 kg"], [5.001, null, "Over 5 kg (bulk)"]]),
  packVolume: range("packVolume", "Pack size", "litres", [[0, 0.5, "Up to 500 ml"], [0.501, 1, "1 litre"], [1.001, 3, "2 to 3 L"], [3.001, 5, "4 to 5 L"], [5.001, null, "Over 5 L"]]),
  sweetType: facet("sweetType", "Sweets", [opt("bar", "Chocolate bars", "chocolate bar|dairy milk|kitkat|snickers|mars|bar"), opt("box", "Chocolate boxes and gifts", "ferrero|chocolate box|gift box|truffle|pralines|assorted chocolate|celebrations|toblerone"),
    opt("candy", "Sweets and candy", "sweet|candy|lollipop|toffee|chewing gum|gum|jelly"), opt("biscuit", "Biscuits and cookies", "biscuit|cookie|digestive")]),
  gift: facet("gift", "Gift", [choice("giftbox", "Gift box / wrapped", "gift|wrapped|hamper|box of"), choice("personal", "Personalised", "personali[sz]ed|custom|name on")]),
  dietary: facet("dietary", "Dietary", [choice("halal", "Halal", "halal"), choice("veg", "Vegetarian", "vegetarian|vegan|veg\\b"), choice("sugarfree", "Sugar free / diet", "sugar[- ]free|no sugar|diet|zero"), choice("glutenfree", "Gluten free", "gluten[- ]free"), choice("organic", "Organic", "organic")]),
  weight: range("weight", "Weight", "kg", [[0, 0.5, "Up to 500 g"], [0.51, 1, "500 g to 1 kg"], [1.01, 5, "1 to 5 kg"], [5.01, 25, "5 to 25 kg"], [25.01, null, "Over 25 kg"]]),
  waterSize: range("waterSize", "Container size", "litres", [[0, 5, "Up to 5 L"], [5.01, 10, "6 to 10 L"], [10.01, 20, "11 to 20 L"], [20.01, null, "Over 20 L"]], "L"),
  fill: facet("fill", "How it is filled", [choice("refill", "Refill (bring your bottle)", "refill"), choice("new", "New bottle with water", "new bottle|with bottle|dispenser")]),
  cylinderSize: range("cylinderSize", "Cylinder size", "kg", [[0, 6, "3 to 6 kg"], [6.01, 13, "13 kg"], [13.01, 22.5, "22.5 kg"], [22.51, null, "50 kg"]], "kg"),
  gasService: facet("gasService", "Gas", [choice("refill", "Refill", "refill|swap|exchange"), choice("new", "New cylinder", "new cylinder|full set|complete|with cylinder|cylinder and"), choice("accessory", "Burners and regulators", "burner|regulator|grill|hose|meko")]),
  // ---- Flowers and gifts
  flowerType: facet("flowerType", "Flowers", [opt("roses", "Roses", "rose"), opt("lilies", "Lilies", "lily|lilies"), opt("sunflowers", "Sunflowers", "sunflower"), opt("carnations", "Carnations and chrysanthemums", "carnation|chrysanthemum|mum"),
    opt("mixed", "Mixed flowers", "mixed|assorted|seasonal"), opt("plants", "Potted plants", "potted|plant|succulent|cactus|orchid"), opt("artificial", "Artificial flowers", "artificial|faux")]),
  arrangement: facet("arrangement", "Arrangement", [choice("bouquet", "Bouquet", "bouquet|bunch"), choice("vase", "In a vase", "vase|jar"), choice("box", "Flower box", "flower box|box of|hat box"), choice("basket", "Basket and hamper", "basket|hamper"), choice("wreath", "Wreath", "wreath")]),
  giftOccasion: facet("giftOccasion", "Occasion", [choice("birthday", "Birthday", "birthday"), choice("love", "Love and anniversary", "anniversary|valentine|love|romantic"), choice("wedding", "Wedding", "wedding|bridal|bride"), choice("sympathy", "Sympathy and funeral", "sympathy|funeral|condolence|wreath"),
    choice("getwell", "Get well", "get well|hospital"), choice("graduation", "Graduation", "graduation"), choice("mother", "Mother's Day", "mother")]),
  stems: range("stems", "Stems", "count", [[0, 6, "Up to 6"], [7, 12, "7 to 12"], [13, 24, "13 to 24"], [25, null, "25 & above"]]),
  // ---- Health
  dosageForm: facet("dosageForm", "Form", [choice("tablet", "Tablets", "tablet|tabs\\b"), choice("capsule", "Capsules", "capsule"), choice("syrup", "Syrup", "syrup|suspension"), choice("cream", "Cream / ointment", "cream|ointment|gel"), choice("drops", "Drops", "drops"), choice("device", "Device / kit", "kit|thermometer|monitor|strips|machine")]),
  prescription: facet("prescription", "Prescription", [choice("otc", "No prescription needed", "over the counter|\\botc\\b|no prescription"), choice("rx", "Prescription only", "prescription only|\\brx\\b|antibiotic")]),
  healthUse: facet("healthUse", "For", [choice("pain", "Pain and fever", "pain|fever|paracetamol|ibuprofen|headache|panadol"), choice("allergy", "Allergy", "allerg|cetirizine|antihistamine|loratadine"), choice("cold", "Cold and flu", "cold|flu|cough|sinus"),
    choice("stomach", "Stomach and digestion", "stomach|diarrh|ors|rehydration|antacid|digest|constipation"), choice("vitamins", "Vitamins and supplements", "vitamin|multivitamin|zinc|supplement|iron|omega|calcium"),
    choice("firstaid", "First aid", "first aid|bandage|plaster|antiseptic|spirit|gauze"), choice("devices", "Tests and devices", "thermometer|pressure|glucose|test|strips|monitor|nebuli"), choice("family", "Family planning", "condom|contracepti|pregnancy|family planning")]),
  farmType: facet("farmType", "Product", [choice("seed", "Seeds and seedlings", "seed"), choice("fert", "Fertiliser", "fertili[sz]er|\\bcan\\b|\\bdap\\b|npk|urea|manure"), choice("feed", "Animal feed", "feed|mash|meal|pellets|lick"),
    choice("chem", "Sprays and chemicals", "acaricide|pesticide|herbicide|fungicide|insecticide|spray"), choice("vet", "Vet medicine", "dewormer|vaccine|antibiotic|vet|tick"), choice("tools", "Tools and equipment", "sprayer|pump|tank|tool|drip|pipe|wheelbarrow")]),
  farmUse: facet("farmUse", "Use", [choice("crops", "Crops", "seed|fertili[sz]er|crop|maize|tomato|kale|sukuma|sprayer|pesticide|herbicide|fungicide"), choice("dairy", "Dairy cattle", "dairy|cattle|cow|calf"),
    choice("poultry", "Poultry", "poultry|layers|chick|broiler|kienyeji|kuku"), choice("pigs", "Pigs, goats and sheep", "pig|goat|sheep"), choice("pets", "Dogs and cats", "dog|cat\\b|puppy|kitten")]),
  healthService: facet("healthService", "Service", [opt("test", "Tests and checks", "test|check|screening|blood pressure|sugar|malaria|hiv"), opt("consult", "Consultation", "consult|doctor|clinician|review"), opt("vaccine", "Vaccination", "vaccin|immuni[sz]|jab"),
    opt("eye", "Eye tests", "eye test|eye exam|vision"), opt("dental", "Dental", "dental|teeth|tooth"), opt("lab", "Lab tests", "lab|laboratory|urinalysis|full haemogram")]),
  // ---- Home and furniture
  furnitureType: facet("furnitureType", "Furniture", [opt("sofa", "Sofas and couches", "sofa|couch|seater|l-?shape|recliner|chesterfield"), opt("chair", "Chairs and stools", "chair|stool|bench"), opt("wardrobe", "Wardrobes and cabinets", "wardrobe|cabinet|cupboard|shelf|shelves|bookshelf|drawer|dresser|dressing table"),
    opt("tvstand", "TV stands and wall units", "tv stand|tv unit|wall unit|entertainment unit"), opt("desk", "Desks", "desk|workstation"), opt("outdoor", "Outdoor and garden", "outdoor|garden|patio")]),
  bedType: facet("bedType", "Bed", [{ ...opt("bed", "Beds", "bed|bedframe|bed frame|bunk|double-?decker|cot"), onName: true }, { ...opt("mattress", "Mattresses", "mattress"), onName: true }, opt("bunk", "Bunk and double-decker", "bunk|double-?decker|decker"), opt("storage", "With storage", "storage|drawers|ottoman"), opt("baby", "Cots and baby beds", "cot|crib|baby bed")]),
  bedSize: facet("bedSize", "Bed size", [choice("3x6", "3 x 6 ft (single)", "3 ?(?:x|by) ?6|single|90 ?x ?190"), choice("4x6", "4 x 6 ft (three-quarter)", "4 ?(?:x|by) ?6|three-?quarter|120 ?x ?190"), choice("5x6", "5 x 6 ft (double / queen)", "5 ?(?:x|by) ?6|double|queen|150 ?x ?190"),
    choice("6x6", "6 x 6 ft (king)", "6 ?(?:x|by) ?6|\\bking\\b|180 ?x ?190")]),
  mattressThickness: range("mattressThickness", "Mattress thickness", "thickInch", [[0, 5, "Up to 5 in"], [6, 7, "6 to 7 in"], [8, 9, "8 to 9 in"], [10, null, "10 in & above"]], "in"),
  mattressType: facet("mattressType", "Mattress", [choice("foam", "Foam", "foam|high density|quilted"), choice("spring", "Spring", "spring|pocket"), choice("orthopaedic", "Orthopaedic", "orthop(?:a)?edic|ortho")]),
  tableType: facet("tableType", "Table", [opt("dining", "Dining tables", "dining"), opt("coffee", "Coffee and side tables", "coffee table|side table|centre table|center table|nest"), opt("office", "Office and study desks", "office|study|desk|computer table"),
    opt("plastic", "Plastic and folding", "plastic|folding|foldable"), opt("kitchen", "Kitchen and bar", "kitchen|bar table|counter"), opt("dressing", "Dressing tables", "dressing table")]),
  tableShape: facet("tableShape", "Shape", [choice("rect", "Rectangular", "rectangular|rectangle|oblong"), choice("round", "Round", "round|circular"), choice("square", "Square", "square"), choice("oval", "Oval", "oval")]),
  seats: range("seats", "Seats", "seats", [[1, 1, "1 seat"], [2, 2, "2-seater"], [3, 3, "3-seater"], [4, 5, "4 to 5 seats"], [6, null, "6 seats & above"]]),
  room: facet("room", "Room", [choice("living", "Living room", "sofa|couch|coffee table|tv stand|living|lounge"), choice("bedroom", "Bedroom", "bed|mattress|wardrobe|dressing|bedroom"), choice("dining", "Dining", "dining"), choice("office", "Office", "office|desk|study"),
    choice("kitchen", "Kitchen", "kitchen|cooker|pan|pot|cup"), choice("bathroom", "Bathroom", "bathroom|bath|shower|toilet"), choice("outdoor", "Outdoor", "outdoor|garden|patio|balcony")]),
  kitchenType: facet("kitchenType", "Kitchen", [opt("cookware", "Pots, pans and sufurias", "sufuria|pan|pot|cooker|casserole|wok|frying pan|pressure cooker"), opt("tableware", "Plates, cups and dinner sets", "plate|cup|mug|dinner set|bowl|glass|tumbler|tea set"),
    opt("cutlery", "Cutlery and utensils", "cutlery|spoon|fork|knife|knives|ladle|utensil|chopping board|grater"), opt("storage", "Storage and containers", "container|jar|storage|basin|bucket|jug|lunch box"),
    opt("flask", "Flasks and bottles", "flask|thermos|bottle"), opt("jiko", "Jikos and charcoal stoves", "jiko|charcoal")]),
  kitchenMaterial: facet("kitchenMaterial", "Material", [choice("stainless", "Stainless steel", "stainless"), choice("aluminium", "Aluminium", "alumin"), choice("nonstick", "Non-stick", "non-?stick|teflon|granite"), choice("glass", "Glass", "glass"),
    choice("ceramic", "Ceramic and porcelain", "ceramic|porcelain|melamine"), choice("plastic", "Plastic", "plastic"), choice("cast", "Cast iron", "cast iron")]),
  pieces: range("pieces", "Pieces in the set", "count", [[1, 1, "Single piece"], [2, 6, "2 to 6 pieces"], [7, 16, "7 to 16 pieces"], [17, null, "17 pieces & above"]]),
  capacityL: range("capacityL", "Capacity", "litres", [[0, 1.9, "Up to 2 L"], [2, 9.9, "2 to 10 L"], [10, 99, "10 to 99 L"], [100, null, "100 L & above"]], "L"),
  burners: facet("burners", "Burners", [choice("1", "Single burner", "single|one burner|1 burner"), choice("2", "Two burners", "two-?burner|2 burner|double"), choice("3", "Three or more", "three|four|3 burner|4 burner")]),
  textileType: facet("textileType", "Bedding and textiles", [opt("bedsheet", "Bedsheets", "bedsheet|bed sheet|sheet set|fitted sheet"), opt("duvet", "Duvets and blankets", "duvet|comforter|blanket|quilt|bedcover|bed cover"), opt("pillow", "Pillows", "pillow|cushion"),
    opt("curtain", "Curtains", "curtain|sheer|blind"), opt("towel", "Towels and bath mats", "towel|bath mat|bathroom mat"), opt("net", "Mosquito nets", "mosquito net|net")]),
  rugType: facet("rugType", "Carpet", [opt("carpet", "Carpets", "carpet|wall to wall|wall-to-wall"), opt("rug", "Rugs", "rug|area rug"), opt("doormat", "Doormats", "doormat|door mat|welcome mat"), opt("runner", "Runners", "runner"), opt("shaggy", "Shaggy / fluffy", "shaggy|fluffy|fur")]),
  rugSize: facet("rugSize", "Size", [choice("small", "Small (up to 4 x 6 ft)", "\\b(?:2|3|4) ?x ?(?:3|4|5|6) ?(?:ft|feet)?\\b|60 ?x ?90|80 ?x ?120|120 ?x ?160|small"), choice("medium", "Medium (5 x 7 ft)", "\\b5 ?x ?(?:7|8) ?(?:ft|feet)?\\b|160 ?x ?230|150 ?x ?200|medium"),
    choice("large", "Large (6 x 9 ft)", "\\b6 ?x ?9\\b|200 ?x ?(?:290|300)|large"), choice("xl", "Extra large (8 x 10 ft & above)", "\\b(?:8|9) ?x ?(?:10|11|12)\\b|240 ?x ?340|300 ?x ?400|extra large|room size|wall to wall")]),
  shape: facet("shape", "Shape", [choice("rect", "Rectangular", "rectangular|rectangle"), choice("round", "Round", "\\bround\\b|circular"), choice("runner", "Runner (long)", "runner")]),
  // ---- Building, plumbing and electrical
  buildMaterial: facet("buildMaterial", "Material", [opt("cement", "Cement and sand", "cement|sand|ballast|hardcore|lime|plaster"), opt("steel", "Steel and iron", "steel|iron bar|rebar|y8|y10|y12|y16|brc|wire mesh|angle line"),
    opt("roofing", "Roofing (mabati)", "mabati|iron sheet|roofing|box profile|corrugated|ridge|gutter"), opt("paint", "Paint", "paint|emulsion|gloss|undercoat|primer|varnish|wood finish"),
    opt("tiles", "Tiles", "tile|grout|tile adhesive"), opt("nails", "Nails, screws and bolts", "nail|screw|bolt|nut|washer|rivet"), opt("tools", "Tools", "hammer|saw|tape measure|spade|jembe|panga|wheelbarrow|trowel|level|drill|grinder|spanner|pliers"),
    opt("doors", "Doors, windows and locks", "door|window|padlock|lock|hinge|handle|grill")]),
  sheetGauge: facet("sheetGauge", "Gauge", ["26", "28", "30", "32"].map((g) => choice(`g${g}`, `Gauge ${g}`, `(?:gauge|\\bg) ?${g}\\b|\\b${g} ?(?:g|gauge)\\b`))),
  paintType: facet("paintType", "Paint", [choice("emulsion", "Emulsion (walls)", "emulsion|silk|matt|vinyl"), choice("gloss", "Gloss and enamel", "gloss|enamel"), choice("undercoat", "Undercoat and primer", "undercoat|primer"),
    choice("wood", "Varnish and wood finish", "varnish|wood finish|wood stain|sanding sealer"), choice("roof", "Roof and waterproof", "roof|waterproof")]),
  paintSize: range("paintSize", "Tin size", "litres", [[0, 1, "1 litre & under"], [1.01, 4, "4 litres"], [4.01, 5, "5 litres"], [5.01, null, "20 litres"]]),
  woodType: facet("woodType", "Wood", [choice("cypress", "Cypress", "cypress"), choice("pine", "Pine", "\\bpine\\b"), choice("mahogany", "Mahogany", "mahogany"), choice("mvule", "Mvule / hardwood", "mvule|mninga|teak|hardwood|meru oak|oak"),
    choice("eucalyptus", "Eucalyptus (blue gum)", "eucalyptus|blue ?gum|gum pole"), choice("ply", "Plywood and blockboard", "ply ?wood|blockboard|block board|marine ply"), choice("mdf", "MDF and chipboard", "\\bmdf\\b|chipboard|particle board|hardboard")]),
  timberSize: facet("timberSize", "Size", [choice("2x2", "2 x 2", "\\b2 ?(?:x|by) ?2\\b"), choice("2x3", "2 x 3 (3 x 2)", "\\b(?:2 ?(?:x|by) ?3|3 ?(?:x|by) ?2)\\b"), choice("2x4", "2 x 4 (4 x 2)", "\\b(?:2 ?(?:x|by) ?4|4 ?(?:x|by) ?2)\\b"),
    choice("2x6", "2 x 6 (6 x 2)", "\\b(?:2 ?(?:x|by) ?6|6 ?(?:x|by) ?2)\\b"), choice("1x6", "1 x 6 and 1 x 8 boards", "\\b(?:1 ?(?:x|by) ?(?:6|8|10|12)|(?:6|8|10|12) ?(?:x|by) ?1)\\b"),
    choice("sheet", "8 x 4 ft sheets", "\\b8 ?(?:x|by) ?4\\b|\\b4 ?(?:x|by) ?8\\b|sheet|board (?:of|size)"), choice("pole", "Poles and posts", "pole|post|rafter")]),
  timberLength: range("timberLength", "Length", "feet", [[0, 8, "Up to 8 ft"], [9, 12, "9 to 12 ft"], [13, 16, "13 to 16 ft"], [17, null, "Over 16 ft"]], "ft"),
  treatment: facet("treatment", "Treatment", [choice("treated", "Treated", "\\btreated|pressure treated|cuprinol|anti-?termite"), choice("untreated", "Untreated", "untreated|raw"), choice("planed", "Planed / dressed", "planed|dressed|smooth"), choice("rough", "Rough sawn", "rough|sawn")]),
  electricalType: facet("electricalType", "Item", [opt("wire", "Cables and wire", "cable|wire|flex|twin and earth"), opt("socket", "Sockets and switches", "socket|switch|plug|outlet"), opt("breaker", "Breakers and boards", "breaker|mcb|rcd|rccb|consumer unit|db box|distribution board"),
    opt("extension", "Extensions and adapters", "extension|multi ?plug|adapter|surge"), opt("pipe", "Pipes and fittings", "pipe|ppr|pvc pipe|hdpe|elbow|tee|union|fitting|valve|gate valve"), opt("tap", "Taps and showers", "tap|mixer|shower|faucet|sink"),
    opt("tank", "Water tanks", "tank|roto|kentank"), opt("conduit", "Conduit and trunking", "conduit|trunking")]),
  cableSize: range("cableSize", "Cable size", "mm2", [[0, 1.5, "1.0 to 1.5 mm²"], [1.51, 2.5, "2.5 mm²"], [2.51, 4, "4 mm²"], [4.01, null, "6 mm² & above"]], "mm²"),
  pipeSize: facet("pipeSize", "Pipe size", [choice("half", "½ inch", "1/2 ?(?:\"|in|inch)|half inch|½|20 ?mm"), choice("threequarter", "¾ inch", "3/4 ?(?:\"|in|inch)|¾|25 ?mm"), choice("one", "1 inch", "\\b1 ?(?:\"|in\\b|inch)|32 ?mm"),
    choice("two", "1½ to 2 inch", "1\\.5 ?(?:\"|in|inch)|1 1/2|\\b2 ?(?:\"|in\\b|inch)|50 ?mm"), choice("four", "3 to 4 inch", "\\b[34] ?(?:\"|in\\b|inch)|110 ?mm")]),
  tankCapacity: range("tankCapacity", "Tank size", "litres", [[0, 500, "Up to 500 L"], [501, 1000, "1,000 L"], [1001, 5000, "2,000 to 5,000 L"], [5001, null, "Over 5,000 L"]], "L"),
  // ---- Auto
  // Make, then Model, then Year: the "does this fit my car?" filters, most used first for parts.
  vehicle: facet("vehicle", "Make", [["toyota", "Toyota", "toyota|probox|fielder|axio|premio|allion|vitz|corolla|hilux|prado|land ?cruiser|noah|voxy|harrier|rav ?4|mark ?x|belta|passo|sienta|succeed"],
    ["nissan", "Nissan", "nissan|tiida|x-?trail|navara|wingroad|ad van|sylphy|serena|caravan|juke"], ["subaru", "Subaru", "subaru|forester|impreza|legacy|outback|\\bxv\\b"],
    ["mazda", "Mazda", "mazda|demio|axela|atenza|cx-?5|verisa"], ["honda", "Honda", "honda(?! ace)|vezel|cr-?v|insight|civic"], ["mitsubishi", "Mitsubishi", "mitsubishi|outlander|pajero|canter|l200|rvr"],
    ["isuzu", "Isuzu", "isuzu|d-?max|\\bnqr\\b|\\bfrr\\b|\\bnpr\\b|\\bnkr\\b"], ["mercedes", "Mercedes-Benz", "mercedes|benz|c-?class|e-?class|\\bml\\b"], ["volkswagen", "Volkswagen", "volkswagen|\\bvw\\b|passat|touareg|tiguan"],
    ["suzuki", "Suzuki", "suzuki|escudo|vitara"], ["ford", "Ford", "\\bford\\b"], ["landrover", "Land Rover", "land ?rover|range ?rover"],
    ["bmw", "BMW", "\\bbmw\\b"], ["hyundai", "Hyundai / Kia", "hyundai|\\bkia\\b|sportage|tucson"]].map(([id, label, re]) => choice(id, label, re))),
  partCondition: facet("partCondition", "Part condition", [choice("genuine", "Genuine", "genuine|original|oem"), choice("aftermarket", "Aftermarket", "aftermarket|compatible"), choice("used", "Ex-Japan / used", "ex-?japan|used|second")]),
  autoPart: facet("autoPart", "Part", [opt("tyre", "Tyres", "tyre|tire|tube|rim"), opt("battery", "Batteries", "battery"), opt("oil", "Oils and fluids", "oil|coolant|brake fluid|atf|grease"), opt("brake", "Brakes", "brake pad|brake shoe|disc|brake"),
    opt("filter", "Filters", "filter"), opt("light", "Lights and bulbs", "headlight|tail light|bulb|lamp"), opt("wiper", "Wipers", "wiper"), opt("engine", "Engine and suspension", "spark plug|plug|belt|shock|bush|mount|clutch|radiator|engine")]),
  tyreSize: facet("tyreSize", "Rim size", ["13", "14", "15", "16", "17", "18"].map((r) => choice(`r${r}`, `R${r}${r === "18" ? " & above" : ""}`, r === "18" ? "\\bR ?(?:1[89]|2[0-2])\\b|/\\d\\d ?R ?(?:1[89]|2[0-2])" : `\\bR ?${r}\\b|/\\d\\d ?R ?${r}\\b`))),
  oilGrade: facet("oilGrade", "Oil grade", ["5W-30", "10W-30", "10W-40", "15W-40", "20W-50"].map((g) => choice(g.toLowerCase(), g, g.replace("-", "-?")))),
  carService: facet("carService", "Service", [opt("exterior", "Exterior wash", "exterior|body wash|quick wash"), opt("full", "Full wash and valet", "full wash|valet|detail|full"), opt("interior", "Interior and seats", "interior|seat|vacuum|upholstery|carpet"),
    opt("engine", "Engine wash", "engine wash|engine"), opt("service", "Car service", "service|oil change"), opt("diagnostics", "Diagnostics", "diagnos|scan|computer"), opt("repair", "Repairs", "repair|brake|clutch|suspension|panel|spray|body work"), opt("wheels", "Wheel alignment and balancing", "alignment|balancing|wheel")]),
  vehicleClass: facet("vehicleClass", "Vehicle", [choice("saloon", "Saloon / small car", "saloon|sedan|hatchback|small car"), choice("suv", "SUV and pick-up", "suv|4x4|pick-?up|double cab|land cruiser|prado"), choice("van", "Van and matatu", "van|matatu|minibus|bus|truck|lorry"), choice("moto", "Motorbike", "motorbike|boda|motorcycle")]),
  // ---- Printing, stationery and office
  printService: facet("printService", "Service", [opt("print", "Printing", "print|printing|printout"), opt("copy", "Photocopy", "photocopy|copy|copies"), opt("scan", "Scanning", "scan|scanning"), opt("laminate", "Lamination", "laminat"),
    opt("bind", "Binding", "binding|spiral|bind"), opt("typing", "Typing and documents", "typing|type|cv|letter|document"), opt("photo", "Passport photos", "passport photo|photo"), opt("design", "Banners, posters and cards", "banner|poster|business card|flyer|invitation|sticker|t-shirt print|branding|design"),
    opt("online", "Online services (eCitizen, KRA)", "ecitizen|kra|nhif|sha|helb|kuccps|online application|itax|pin|good conduct|internet|browsing")]),
  paperSize: facet("paperSize", "Paper size", ["A3", "A4", "A5", "A6"].map((p) => choice(p.toLowerCase(), p, `\\b${p}\\b`))),
  colourMode: facet("colourMode", "Colour mode", [choice("bw", "Black and white", "black and white|b ?& ?w|\\bmono\\b"), choice("colour", "Colour", "colou?r print|full colou?r|\\bcolou?r\\b")]),
  stationeryType: facet("stationeryType", "Stationery", [opt("pen", "Pens", "pen|biro|ballpoint|gel pen"), opt("pencil", "Pencils and crayons", "pencil|crayon|colou?ring"), opt("marker", "Markers and highlighters", "marker|highlighter"),
    opt("book", "Exercise books and notebooks", "exercise book|notebook|counter book|note book|diary|journal|register"), opt("paper", "Paper and reams", "ream|paper|manila|photocopy paper|printing paper"),
    opt("board", "Whiteboards and notice boards", "whiteboard(?! markers?)|white board(?! markers?)|blackboard|chalkboard|notice board|cork board|flip chart"), opt("files", "Files, folders and envelopes", "file|folder|envelope|box file|spring file"),
    opt("desk", "Staplers, glue and scissors", "stapler|staple|glue|tape|scissor|punch|sharpener|eraser|rubber|ruler|maths set|geometry"), opt("calculator", "Calculators", "calculator"), opt("bag", "School bags and cases", "pencil case|school bag")]),
  penType: facet("penType", "Pen type", [choice("ballpoint", "Ballpoint", "ballpoint|biro|ball pen|bic"), choice("gel", "Gel", "\\bgel\\b"), choice("fountain", "Fountain", "fountain"), choice("whiteboard", "Whiteboard markers", "whiteboard marker|dry erase"),
    choice("permanent", "Permanent markers", "permanent"), choice("highlighter", "Highlighters", "highlighter")]),
  packCount: range("packCount", "Pack", "count", [[1, 1, "Single"], [2, 10, "2 to 10"], [11, 24, "11 to 24"], [25, 50, "25 to 50"], [51, null, "Over 50"]]),
  boardSize: facet("boardSize", "Board size", [choice("small", "Small (60 x 90 cm / 2 x 3 ft)", "60 ?x ?90|2 ?x ?3 ?(?:ft|feet)|small"), choice("medium", "Medium (90 x 120 cm / 3 x 4 ft)", "90 ?x ?120|3 ?x ?4 ?(?:ft|feet)|medium"),
    choice("large", "Large (120 x 180 cm / 4 x 6 ft)", "120 ?x ?180|4 ?x ?6 ?(?:ft|feet)|large"), choice("xl", "Extra large (120 x 240 cm / 4 x 8 ft)", "120 ?x ?240|4 ?x ?8 ?(?:ft|feet)|extra large")]),
  boardMount: facet("boardMount", "Board", [choice("wall", "Wall mounted", "wall"), choice("stand", "On a stand / easel", "stand|easel|mobile|wheels"), choice("magnetic", "Magnetic", "magnetic"), choice("double", "Double sided", "double[- ]sided")]),
  // ---- Other services
  laundryService: facet("laundryService", "Service", [opt("washfold", "Wash and fold", "wash and fold|wash & fold|washing|laundry"), opt("dryclean", "Dry cleaning", "dry ?clean"), opt("iron", "Ironing", "iron|press"), opt("duvet", "Duvets, curtains and carpets", "duvet|curtain|carpet|blanket|rug"),
    opt("shoes", "Shoe cleaning", "shoe|sneaker"), opt("house", "House and office cleaning", "house clean|home clean|office clean|deep clean|fumigat|move-?in|move-?out")]),
  pricedBy: facet("pricedBy", "Priced", [choice("kg", "Per kg", "per kg|/kg|by weight|kilo"), choice("item", "Per item", "per item|per piece|each|per garment|by item"), choice("room", "Per room / house", "per room|bedroom|per house|per visit")]),
  pickup: facet("pickup", "Pick-up", [choice("pickup", "Pick-up and delivery", "pick-?up|collect|delivery|deliver"), choice("dropoff", "Drop off at the shop", "drop[- ]off|bring")]),
  shootType: facet("shootType", "Shoot", [opt("wedding", "Weddings", "wedding|ruracio|ngurario|engagement|dowry"), opt("birthday", "Birthdays and parties", "birthday|party|baby shower"), opt("graduation", "Graduations", "graduation"),
    opt("studio", "Studio and portraits", "studio|portrait|passport|family photo|headshot"), opt("corporate", "Corporate and events", "corporate|event|conference|launch"), opt("video", "Video", "video|videography|drone|cinematic")]),
  eventService: facet("eventService", "Hire", [opt("tent", "Tents", "tent|marquee|canopy"), opt("chairs", "Chairs and tables", "chair|table"), opt("decor", "Decor", "decor|decoration|flowers|balloon"), opt("sound", "Sound and PA", "sound|pa system|dj|speaker|mc"), opt("catering", "Catering", "catering|food")]),
  deliverables: facet("deliverables", "You get", [choice("digital", "Digital photos", "digital|soft copy|online gallery|usb|flash"), choice("prints", "Prints and album", "print|album|frame"), choice("video", "Video", "video|highlight")]),
  tuitionLevel: facet("tuitionLevel", "Level", [choice("daycare", "Daycare and pre-school", "daycare|day care|pre-?school|kindergarten|pp1|pp2|baby class|playgroup"), choice("primary", "Primary (Grade 1 to 6)", "primary|grade [1-6]\\b|lower primary|upper primary"),
    choice("junior", "Junior school (Grade 7 to 9)", "junior|jss|grade [7-9]\\b"), choice("secondary", "Secondary / high school", "secondary|high school|form [1-4]|kcse"), choice("adult", "College and adults", "college|adult|university|professional")]),
  subject: facet("subject", "Subject", [choice("maths", "Maths", "math"), choice("english", "English and Kiswahili", "english|kiswahili|language|reading|french|german"), choice("science", "Sciences", "science|physics|chemistry|biology"),
    choice("computer", "Computer and coding", "computer|coding|programming|ict"), choice("music", "Music and art", "music|piano|guitar|art|drawing"), choice("driving", "Driving", "driving")]),
  lessonMode: facet("lessonMode", "Where", [choice("home", "At home", "home tuition|at home|home visit"), choice("centre", "At the centre", "centre|center|in class"), choice("online", "Online", "online|zoom|virtual")]),
  agentService: facet("agentService", "Service", [choice("mpesa", "M-Pesa deposit and withdrawal", "m-?pesa|deposit|withdraw"), choice("airtime", "Airtime and bundles", "airtime|bundle|data|credit"), choice("bills", "Bill payments", "bill|kplc|tokens|water bill|dstv|gotv|zuku"), choice("bank", "Bank agent", "bank|agent banking|equity|kcb|co-?op")])
};

// ---- more filters: every kind of shop on a Kenyan high street, and the ones still to come -----------------------------
// Each filter belongs to the kinds that list it (KINDS below), so a filter never shows where it means nothing: meat has no
// colour, a haircut has no size, a print job has no pack weight. Numbers are ranges with their unit; labels are checkboxes.
const MODELS = [
  ["toyota", ["Probox / Succeed", "probox|succeed"], ["Fielder", "fielder"], ["Axio", "axio"], ["Premio / Allion", "premio|allion"], ["Vitz", "vitz"], ["Corolla", "corolla"], ["Hilux", "hilux"],
    ["Land Cruiser / Prado", "land ?cruiser|prado"], ["Noah / Voxy", "noah|voxy"], ["Harrier", "harrier"], ["RAV4", "rav ?4"], ["Mark X", "mark ?x"], ["Belta", "belta"], ["Passo", "passo"], ["Sienta", "sienta"]],
  ["nissan", ["Note", "nissan note|\\bnote (?:e-?power|e12|e11)\\b"], ["Tiida", "tiida"], ["X-Trail", "x-?trail"], ["Navara", "navara"], ["AD van / Wingroad", "ad van|wingroad"], ["Sylphy", "sylphy"],
    ["Serena", "serena"], ["Caravan", "caravan"], ["March", "nissan march"], ["Juke", "juke"]],
  ["subaru", ["Forester", "forester"], ["Impreza", "impreza"], ["Legacy", "legacy"], ["Outback", "outback"], ["XV", "\\bxv\\b"]],
  ["mazda", ["Demio", "demio"], ["Axela", "axela"], ["Atenza", "atenza"], ["CX-5", "cx-?5"], ["Verisa", "verisa"]],
  ["honda", ["Fit", "honda fit|\\bfit (?:rs|hybrid|gd|ge|gk)\\b"], ["Vezel", "vezel"], ["CR-V", "cr-?v"], ["Insight", "insight"], ["Civic", "civic"]],
  ["mitsubishi", ["Outlander", "outlander"], ["Pajero", "pajero"], ["Canter", "canter"], ["L200", "l200"], ["RVR", "\\brvr\\b"]],
  ["isuzu", ["D-Max", "d-?max"], ["NQR / FRR / NPR trucks", "\\bnqr\\b|\\bfrr\\b|\\bnpr\\b|\\bnkr\\b"]],
  ["volkswagen", ["Golf", "vw golf|golf [4-8]\\b|golf (?:iv|v|vi|vii)\\b"], ["Polo", "vw polo|polo vivo"], ["Passat", "passat"], ["Touareg", "touareg"], ["Tiguan", "tiguan"]],
  ["suzuki", ["Swift", "suzuki swift"], ["Alto", "suzuki alto"], ["Escudo / Vitara", "escudo|vitara"]],
  ["ford", ["Ranger", "ford ranger"], ["Everest", "ford everest"], ["Focus", "ford focus"]]
];

Object.assign(FACETS, {
  // ---- Vehicles and motorbikes
  carModel: { ...facet("carModel", "Model", MODELS.flatMap(([make, ...models]) => models.map(([label, re]) => ({ ...choice(`${make}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, label, re), make })))), follows: "vehicle" },
  year: range("year", "Year", "year", [[0, 2005, "2005 & older"], [2006, 2010, "2006 to 2010"], [2011, 2015, "2011 to 2015"], [2016, 2019, "2016 to 2019"], [2020, null, "2020 & newer"]]),
  bikeMake: facet("bikeMake", "Make", [choice("bajaj", "Bajaj (Boxer)", "bajaj|boxer"), choice("tvs", "TVS", "\\btvs\\b|apache|star hlx|hlx"), choice("honda", "Honda", "honda|ace 1[12]5"), choice("haojue", "Haojue", "haojue"),
    choice("skygo", "Skygo", "skygo"), choice("yamaha", "Yamaha", "yamaha"), choice("suzuki", "Suzuki", "suzuki"), choice("kymco", "Kymco / scooters", "kymco|scooter"), choice("electric", "Electric (e-bike)", "electric|e-?bike|roam|ampersand")]),
  engineCc: range("engineCc", "Engine size", "cc", [[0, 110, "Up to 110 cc"], [111, 150, "111 to 150 cc"], [151, 250, "151 to 250 cc"], [251, null, "Over 250 cc"]], "cc"),
  bikePart: facet("bikePart", "Part", [opt("bike", "Whole motorbikes", "motorbike|motorcycle|motor ?bike|piki ?piki|scooter|e-?bike"), opt("tyre", "Tyres and tubes", "tyre|tire|tube|rim"), opt("chain", "Chain and sprocket", "chain|sprocket|kit"),
    opt("brake", "Brakes and cables", "brake|cable|clutch"), opt("engine", "Engine parts", "piston|ring|carburet|plug|gasket|engine|cylinder|head|valve|bearing"), opt("body", "Body, seats and mirrors", "seat|mirror|mudguard|fender|carrier|crash guard|body|tank"),
    opt("light", "Lights and electrics", "headlight|indicator|bulb|light|battery|wiring|horn"), opt("gear", "Helmets and riding gear", "helmet|reflector|jacket|gloves|gear")]),
  // ---- Fish, poultry and meat
  fishType: facet("fishType", "Fish", [opt("tilapia", "Tilapia", "tilapia|ngege"), opt("omena", "Omena (dagaa)", "omena|dagaa|daga"), opt("perch", "Nile perch (mbuta)", "nile perch|mbuta|perch"), opt("catfish", "Catfish (kamongo)", "cat ?fish|kamongo|mumi"),
    opt("sardine", "Sardines and mackerel", "sardine|mackerel|tuna"), opt("seafood", "Prawns and seafood", "prawn|shrimp|seafood|octopus|squid|lobster|crab"), opt("other", "Salmon and imported fish", "salmon|hake|cod|trout|kingfish")]),
  fishPrep: facet("fishPrep", "Prepared", [choice("fresh", "Fresh", "fresh|\\blive\\b|today'?s catch"), choice("frozen", "Frozen", "frozen"), choice("fried", "Fried", "fried|fry"), choice("smoked", "Smoked", "smoked"), choice("dried", "Dried / sun-dried", "dried|dry|sun-?dried|salted")]),
  fishCut: facet("fishCut", "Cut", [choice("whole", "Whole fish", "whole|full fish"), choice("fillet", "Fillets", "fillet|filet|boneless"), choice("cleaned", "Gutted and scaled", "gutted|scaled|cleaned"), choice("pieces", "Steaks and pieces", "steak|pieces|cubes|chunks")]),
  meatState: facet("meatState", "Fresh or frozen", [choice("fresh", "Fresh", "fresh|today|slaughtered today"), choice("frozen", "Frozen", "frozen"), choice("marinated", "Marinated", "marinated|spiced|seasoned"), choice("smoked", "Smoked and processed", "smoked|cured|processed|bacon|\\bham\\b|sausage|smokie")]),
  birdType: facet("birdType", "Bird", [opt("broiler", "Broilers", "broiler"), opt("layer", "Layers", "layers?(?![a-z]| mash| pellets| feed| concentrate)|pullet|point of lay"), opt("kienyeji", "Kienyeji (indigenous)", "kienyeji|indigenous|local chicken|cockerel|rooster|hen"),
    opt("improved", "Improved kienyeji", "improved kienyeji|kuroiler|kenbro|rainbow rooster|sasso|kari"), opt("chicks", "Chicks", "chicks?(?![a-z]| mash| feed| starter)|day-?old"), opt("eggs", "Eggs", "egg"), opt("duck", "Ducks, turkeys and quails", "duck|turkey|quail|guinea fowl|goose|geese")]),
  birdAge: facet("birdAge", "Age", [choice("dayold", "Day-old", "day-?old|1 day"), choice("weeks", "1 to 8 weeks", "\\b[1-8] ?(?:-|to) ?[2-8]? ?weeks?|\\b[1-8] weeks?|brooded"), choice("pol", "Point of lay", "point of lay|\\bpol\\b|1[6-9] weeks|20 weeks"),
    choice("mature", "Mature / ready", "mature|ready|grown|months? old|\\badult")]),
  birdBreed: facet("birdBreed", "Breed", [choice("kenbro", "Kenbro", "kenbro"), choice("kuroiler", "Kuroiler", "kuroiler"), choice("rainbow", "Rainbow Rooster", "rainbow rooster"), choice("sasso", "Sasso", "sasso"),
    choice("cobb", "Cobb / Ross (broilers)", "cobb|ross 308|\\bross\\b"), choice("isa", "ISA Brown / Hy-Line (layers)", "isa brown|hy-?line|lohmann|shaver"), choice("kari", "KARI improved kienyeji", "\\bkari\\b|kalro")]),
  liveDressed: facet("liveDressed", "Sold", [choice("live", "Live", "\\blive\\b|alive"), choice("dressed", "Dressed (slaughtered)", "dressed|slaughtered|cleaned|whole chicken|ready to cook")]),
  eggPack: facet("eggPack", "Eggs", [choice("single", "Single eggs", "per egg|single egg|\\beach\\b"), choice("half", "Half tray (15)", "half tray|15 eggs"), choice("tray", "Tray (30)", "\\btray\\b|30 eggs|tray of 30"), choice("crate", "Crates and bulk", "crate|box of|bulk|\\b[2-9]\\d? trays")]),
  vaccinated: facet("vaccinated", "Health", [choice("vaccinated", "Vaccinated", "vaccinated|vaccines? given|immuni[sz]ed"), choice("dewormed", "Dewormed", "dewormed")]),
  // ---- Water, gas, juice, cereals
  waterType: facet("waterType", "Water", [choice("purified", "Purified (RO)", "purified|reverse osmosis|\\bro\\b|treated"), choice("mineral", "Mineral", "mineral"), choice("spring", "Spring", "spring"), choice("alkaline", "Alkaline", "alkaline"), choice("distilled", "Distilled", "distilled")]),
  waterPlan: facet("waterPlan", "Delivery plan", [choice("daily", "Daily", "daily|every day"), choice("weekly", "Weekly", "weekly|per week|every week"), choice("monthly", "Monthly / subscription", "monthly|subscription|subscribe")]),
  gasBrand: facet("gasBrand", "Gas brand", [choice("total", "Total", "\\btotal\\b|totalenergies"), choice("kgas", "K-Gas", "k-?gas"), choice("afrigas", "Afrigas", "afrigas"), choice("hashi", "Hashi", "hashi"), choice("progas", "Pro Gas", "pro ?gas"),
    choice("rubis", "Rubis / Mpishi", "rubis|oilibya|mpishi"), choice("lake", "Lake Gas", "lake gas"), choice("sea", "Sea Gas", "sea gas"), choice("other", "Other brands", "mwanga|men gas|supa gas|delta gas|ola energy")]),
  fruit: facet("fruit", "Fruit", [choice("mango", "Mango", "mango"), choice("passion", "Passion", "passion"), choice("orange", "Orange", "orange"), choice("pineapple", "Pineapple", "pineapple"), choice("watermelon", "Watermelon", "watermelon|tikiti"),
    choice("avocado", "Avocado", "avocado"), choice("beet", "Beetroot and carrot", "beet|carrot"), choice("lemon", "Lemon and ginger", "lemon|ginger|mint"), choice("mixed", "Mixed / cocktail", "mixed|cocktail|tropical|fruit salad"), choice("berry", "Berries", "berry|berries")]),
  grainType: facet("grainType", "Grain", [opt("maize", "Maize", "maize|mahindi|corn"), opt("beans", "Beans", "bean|maharagwe|rosecoco|nyayo|mwitemania|wairimu"), opt("grams", "Green grams (ndengu)", "green gram|ndengu|dengu|pojo"),
    opt("wheat", "Wheat", "wheat|ngano"), opt("millet", "Millet and sorghum", "millet|wimbi|sorghum|mtama"), opt("peas", "Peas and cowpeas", "peas|kunde|njahi|black bean|pigeon"), opt("nuts", "Groundnuts", "groundnut|peanut|njugu")]),
  milling: facet("milling", "Form", [choice("whole", "Whole grain", "whole|dry|grain|per gorogoro|gorogoro|debe"), choice("flour", "Milled flour", "flour|unga|meal|milled"), choice("service", "Milling service", "milling|posho mill|grinding|kusaga")]),
  produceOrigin: facet("produceOrigin", "Grown", [choice("organic", "Organic", "organic"), choice("local", "Local / farm fresh", "farm fresh|from the farm|shamba|local"), choice("imported", "Imported", "imported|south african|egyptian")]),
  // ---- Wines and spirits
  abv: range("abv", "Alcohol", "abv", [[0, 5.9, "Up to 5.9% (beer, cider)"], [6, 15, "6 to 15% (wine)"], [15.01, null, "Over 15% (spirits)"]], "%"),
  // ---- Health, optician, beauty
  ageGroup: facet("ageGroup", "Age group", [choice("baby", "Babies (0 to 2)", "baby|babies|infant|newborn|toddler|\\b\\d{1,2} ?(?:-|to) ?\\d{1,2} ?months"), choice("kids", "Kids", "kids?|child|children|boys|girls|junior|paediatric|pediatric|school"),
    choice("teens", "Teens", "teen|youth"), choice("adults", "Adults", "adult|\\bmen\\b|women|ladies|gents|unisex")]),
  frameShape: facet("frameShape", "Frame shape", [choice("round", "Round", "\\bround\\b"), choice("square", "Square", "square"), choice("rect", "Rectangle", "rectang"), choice("cateye", "Cat eye", "cat[- ]eye"), choice("aviator", "Aviator", "aviator|pilot"),
    choice("oval", "Oval", "oval"), choice("rimless", "Rimless", "rimless|half[- ]rim")]),
  lensType: facet("lensType", "Lens type", [choice("single", "Single vision", "single vision"), choice("bifocal", "Bifocal", "bifocal"), choice("progressive", "Progressive", "progressive|varifocal|multifocal"), choice("reading", "Reading", "reading")]),
  hairType: facet("hairType", "Hair type", [choice("natural", "Natural hair", "natural hair|\\b4c\\b|kinky|afro"), choice("relaxed", "Relaxed hair", "relaxed hair|relaxer"), choice("curly", "Curly", "curly|curls|wavy"), choice("straight", "Straight / silky", "straight|silky")]),
  hairLength: facet("hairLength", "Length", [choice("short", "Short", "short hair|\\bbob\\b|pixie|\\b(?:8|10|12) ?(?:\"|inch)"), choice("medium", "Medium / shoulder", "medium length|shoulder|\\b(?:14|16|18) ?(?:\"|inch)"), choice("long", "Long", "long hair|long braids|\\b(?:20|22|24) ?(?:\"|inch)"),
    choice("waist", "Waist length & longer", "waist|bum length|extra long|\\b(?:26|28|30|32) ?(?:\"|inch)")]),
  // ---- Farm and pets
  farmForm: facet("farmForm", "Form", [choice("powder", "Powder", "powder|wettable|\\bwp\\b|mash"), choice("liquid", "Liquid", "liquid|\\bec\\b|\\bsl\\b|solution|drench|ml\\b|litre"), choice("granules", "Granules and pellets", "granule|pellet|crumble"), choice("tablets", "Tablets and boluses", "tablet|bolus")]),
  petAnimal: facet("petAnimal", "Pet", [choice("dog", "Dogs", "\\bdogs?\\b|puppy|puppies|canine"), choice("cat", "Cats", "\\bcats?\\b|kitten|feline"), choice("bird", "Birds", "\\bbirds?\\b|parrot|budgie|pigeon"), choice("fish", "Fish", "aquarium|fish food|goldfish|\\bfish\\b"),
    choice("rabbit", "Rabbits", "rabbit")]),
  petProduct: facet("petProduct", "Product", [opt("food", "Food and treats", "food|treat|biscuit|kibble|chow|pedigree|whiskas|meal"), opt("health", "Medicine and dewormers", "dewormer|deworming|tick|flea|vaccine|medicine|vitamin|shampoo"),
    opt("accessory", "Collars, leashes and beds", "collar|leash|lead|harness|bed|bowl|cage|kennel|carrier|toy|aquarium"), opt("litter", "Litter and cleaning", "litter|poop|pad"), opt("vet", "Vet and grooming services", "vet|grooming|clinic|consultation|spay|neuter")]),
  // ---- Security, solar, electronics extras
  securityItem: facet("securityItem", "Item", [opt("camera", "CCTV cameras", "camera|cctv|dome|bullet|ip cam|ptz"), opt("kit", "Complete CCTV kits", "kit|package|dvr|nvr"), opt("alarm", "Alarms and sensors", "alarm|sensor|siren|smoke detector|panic"),
    opt("fence", "Electric fence", "electric fence|energi[sz]er|razor wire|fence"), opt("intercom", "Intercoms and doorbells", "intercom|doorbell|door phone"), opt("access", "Smart locks and access", "smart lock|biometric|fingerprint|access control|card reader|gate motor")]),
  cameraChannels: range("cameraChannels", "Cameras", "channels", [[1, 1, "1 camera"], [2, 4, "2 to 4"], [5, 8, "5 to 8"], [9, null, "9 & above"]], "cameras"),
  cameraMp: range("cameraMp", "Resolution", "mp", [[0, 2, "Up to 2 MP (1080p)"], [2.01, 5, "3 to 5 MP"], [5.01, null, "Over 5 MP (4K)"]], "MP"),
  installation: facet("installation", "Installation", [choice("included", "Installation included", "install(?:ation)? (?:included|inclusive|done)|supply and install|with installation|we install|fitted|fixing included"), choice("supply", "Supply only", "supply only|no installation|diy|self[- ]install")]),
  solarItem: facet("solarItem", "Item", [opt("panel", "Solar panels", "solar panel|panel|monocrystalline|polycrystalline|\\bmono\\b"), opt("kit", "Complete solar kits", "kit|system|home system|package"), opt("inverter", "Inverters", "inverter|hybrid|ups"),
    opt("battery", "Solar batteries", "battery|batteries|lithium|lifepo4|gel|deep cycle"), opt("controller", "Charge controllers", "charge controller|controller|mppt|pwm"), opt("heater", "Solar water heaters and pumps", "water heater|geyser|pump"), opt("light", "Solar lights", "solar light|flood|street light|lamp|lantern")]),
  systemSize: range("systemSize", "System size", "watts", [[0, 100, "Up to 100 W"], [101, 500, "101 to 500 W"], [501, 2000, "501 W to 2 kW"], [2001, null, "Over 2 kW"]], "W"),
  warranty: range("warranty", "Warranty", "months", [[1, 5, "Under 6 months"], [6, 11, "6 to 11 months"], [12, 23, "1 year"], [24, null, "2 years & above"]], "months"),
  partQuality: facet("partQuality", "Part quality", [choice("original", "Original", "original|genuine|oem"), choice("hq", "High copy", "high copy|hq|grade a|copy a"), choice("copy", "Copy / compatible", "\\bcopy\\b|compatible")]),
  mobileNetwork: facet("mobileNetwork", "Network", [choice("safaricom", "Safaricom (M-Pesa)", "safaricom|m-?pesa"), choice("airtel", "Airtel (Airtel Money)", "airtel"), choice("telkom", "Telkom (T-Kash)", "telkom|t-?kash"), choice("bank", "Bank agency", "bank|equity|kcb|co-?op|family bank")]),
  // ---- Babies, books, printing extras
  babyItem: facet("babyItem", "Baby", [opt("diaper", "Diapers and wipes", "diaper|nappy|nappies|pampers|huggies|molfix|wipe"), opt("feeding", "Feeding and formula", "bottle|formula|lactogen|nan\\b|cerelac|sippy|bib|teat|breast pump|feeding"),
    opt("gear", "Strollers, carriers and walkers", "stroller|pram|carrier|walker|car seat|bouncer|rocker"), opt("bath", "Bath and skin care", "bath|lotion|oil|powder|jelly|soap|shampoo"), opt("clothes", "Baby clothes and shawls", "romper|onesie|shawl|receiving blanket|bodysuit|clothes|baby set|mittens|booties"),
    opt("sleep", "Cots and bedding", "cot|crib|carry ?cot|baby bed|baby net|cot sheet"), opt("toys", "Toys and teethers", "toy|teether|rattle|pacifier")]),
  babyAge: facet("babyAge", "Baby's age", [choice("newborn", "Newborn (0 to 3 months)", "newborn|0 ?-? ?3 ?m|0-3|\\bnb\\b|stage 1"), choice("infant", "3 to 12 months", "3 ?-? ?6 ?m|6 ?-? ?12 ?m|6-12|3-6|stage 2|\\b[3-9] months"),
    choice("toddler", "1 to 3 years", "1 ?-? ?3 ?y|12 ?-? ?(?:18|24|36) ?m|toddler|stage 3|\\b[12] years?"), choice("preschool", "3 years & above", "3 ?\\+|3 ?-? ?[5-6] ?y|4 years|5 years|junior|stage 4")]),
  diaperSize: facet("diaperSize", "Diaper size", [choice("nb", "Newborn", "newborn|\\bnb\\b|size 0"), choice("s", "Small (size 1 to 2)", "size [12]\\b|\\bsmall\\b|\\bmini\\b"), choice("m", "Medium (size 3)", "size 3\\b|\\bmedium\\b|\\bmidi\\b"),
    choice("l", "Large (size 4)", "size 4\\b|\\blarge\\b|\\bmaxi\\b"), choice("xl", "Extra large (size 5 & up)", "size [5-7]\\b|x-?large|\\bxl\\b|junior")]),
  bookType: facet("bookType", "Book", [opt("textbook", "Textbooks and course books", "textbook|text book|course book|learner'?s book|pupil'?s book|student'?s book|grade \\d+ (?:english|maths|mathematics|science|kiswahili)"),
    opt("revision", "Revision and past papers", "revision|past paper|kcse|kcpe|kpsea|kjsea|mock|exam|workbook|activity book"), opt("story", "Storybooks and novels", "storybook|story book|novel|reader|fiction|set book|literature"),
    opt("reference", "Dictionaries and atlases", "dictionary|atlas|encyclopedia|thesaurus"), opt("religious", "Bibles and religious books", "bible|quran|qur'an|hymn|prayer|devotional"), opt("other", "Business and self-help", "business|self-help|biography|cookbook|cook book|guide")]),
  bookLevel: facet("bookLevel", "Level", [choice("pp", "Pre-primary (PP1, PP2)", "pp ?1|pp ?2|pre-?primary|pre-?school|playgroup|nursery"), choice("lower", "Lower primary (Grade 1 to 3)", "grade [1-3]\\b|lower primary|class [1-3]\\b"),
    choice("upper", "Upper primary (Grade 4 to 6)", "grade [4-6]\\b|upper primary|class [4-8]\\b|kcpe|kpsea"), choice("junior", "Junior school (Grade 7 to 9)", "grade [7-9]\\b|junior (?:secondary|school)|\\bjss\\b|kjsea"),
    choice("senior", "Secondary and senior school", "form [1-4]|grade 1[0-2]\\b|secondary|senior school|kcse|high school"), choice("college", "College and university", "college|university|diploma|degree|cpa|accounting")]),
  curriculum: facet("curriculum", "Curriculum", [choice("cbc", "CBC / CBE", "\\bcbc\\b|\\bcbe\\b|competency|grade \\d"), choice("844", "8-4-4", "8-?4-?4|kcse|form [1-4]"), choice("igcse", "IGCSE / British", "igcse|cambridge|british|a-?level|o-?level"), choice("ib", "IB / American", "\\bib\\b|international baccalaureate|american")]),
  publisher: facet("publisher", "Publisher", [choice("klb", "KLB", "\\bklb\\b|kenya literature bureau"), choice("longhorn", "Longhorn", "longhorn"), choice("oxford", "Oxford", "oxford"), choice("moran", "Moran", "moran"),
    choice("spotlight", "Spotlight", "spotlight"), choice("mentor", "Mentor", "mentor"), choice("eaep", "EAEP", "\\beaep\\b|east african educational"), choice("jkf", "JKF", "\\bjkf\\b|jomo kenyatta foundation"), choice("storymoja", "Storymoja", "storymoja")]),
  paperWeight: range("paperWeight", "Paper weight", "gsm", [[0, 80, "Up to 80 gsm (everyday)"], [81, 130, "90 to 130 gsm"], [131, 200, "150 to 200 gsm"], [201, null, "250 gsm & above (card)"]], "gsm"),
  printSides: facet("printSides", "Sides", [choice("single", "Single sided", "single[- ]sided|one side"), choice("double", "Double sided", "double[- ]sided|both sides|back to back|duplex")]),
  bindingType: facet("bindingType", "Binding", [choice("spiral", "Spiral / comb", "spiral|\\bcomb\\b|wire-?o"), choice("hardcover", "Hardcover", "hard ?cover|hard ?bound"), choice("soft", "Softcover / perfect", "soft ?cover|perfect bind|glue bind"), choice("thermal", "Thermal", "thermal")]),
  finish: facet("finish", "Finish", [choice("matte", "Matte", "matte?\\b"), choice("glossy", "Glossy", "gloss"), choice("laminated", "Laminated", "laminat")]),
  // ---- Furniture and fabrication
  madeTo: facet("madeTo", "Made", [choice("ready", "Ready-made", "ready[- ]made|in stock|ready to (?:go|take)|available now"), choice("custom", "Made to order / custom size", "made to order|custom|to measure|your (?:size|design)|order in|fabricat")]),
  weldItem: facet("weldItem", "Item", [opt("gate", "Gates", "gate"), opt("grill", "Window and door grills", "grill|burglar proof"), opt("door", "Steel doors and frames", "door|frame"), opt("stand", "Tank stands and towers", "tank stand|tower|stand"),
    opt("carport", "Carports and shades", "carport|shade|canopy|shed|structure|truss"), opt("rail", "Railings and balustrades", "rail|balustrade|handrail"), opt("furniture", "Metal furniture", "chair|table|bed|shelf|rack")]),
  // ---- Events, lodging, property, transport, professionals, trades, funerals
  hireItem: facet("hireItem", "Hire", [opt("tent", "Tents and marquees", "tent|marquee|canopy|dome"), opt("chairs", "Chairs and tables", "chair|table|tiffany|chiavari"), opt("sound", "Sound, PA and DJ", "sound|pa system|public address|speaker|dj|mic"),
    opt("decor", "Decor and lighting", "decor|décor|decoration|lighting|draping|flowers|balloon|red carpet|stage"), opt("catering", "Catering and equipment", "catering|chafing|cutlery|crockery|food"), opt("mc", "MCs and entertainment", "\\bmc\\b|emcee|entertain|band|acrobat"),
    opt("toilet", "Mobile toilets", "toilet|washroom")]),
  setup: facet("setup", "Delivery and setup", [choice("setup", "Delivery and setup included", "set ?up|delivery and|transport included|we deliver|delivered and"), choice("collect", "Collect yourself", "collect|pick ?up")]),
  coverage: facet("coverage", "Coverage", [choice("photo", "Photos only", "photo(?:graphy)? only|photos? only"), choice("video", "Video only", "video only"), choice("both", "Photo and video", "photo and video|photo & video|photography and videography"), choice("drone", "Drone shots", "drone|aerial")]),
  roomType: facet("roomType", "Room", [opt("single", "Single room", "single room|single bed|single"), opt("double", "Double room", "double room|double bed|double|queen|king"), opt("twin", "Twin room", "twin"), opt("deluxe", "Deluxe and executive", "deluxe|executive|superior"),
    opt("suite", "Suites and family rooms", "suite|family room|apartment|cottage|villa"), opt("dorm", "Dorms and hostel beds", "dorm|hostel|bunk"), opt("hall", "Conference and event halls", "conference|hall|boardroom|meeting room")]),
  amenities: facet("amenities", "Amenities", [choice("wifi", "Free Wi-Fi", "wi-?fi|internet"), choice("hotwater", "Hot shower", "hot (?:shower|water)|instant shower"), choice("parking", "Parking", "parking"), choice("breakfast", "Breakfast included", "breakfast|bed and breakfast|\\bb&b\\b|\\bbnb\\b"),
    choice("tv", "TV / DStv", "\\btv\\b|dstv|netflix"), choice("pool", "Swimming pool", "pool"), choice("ac", "Air conditioning", "air ?con|\\bac\\b")]),
  guests: range("guests", "Guests", "guests", [[1, 1, "1 guest"], [2, 2, "2 guests"], [3, 4, "3 to 4 guests"], [5, null, "5 guests & above"]], "guests"),
  dealType: facet("dealType", "For", [choice("rent", "For rent", "for rent|to let|\\brent\\b|rental|per month|monthly"), choice("sale", "For sale", "for sale|selling|title deed|freehold|leasehold")]),
  propertyType: facet("propertyType", "Property", [opt("bedsitter", "Bedsitters and single rooms", "bed-?sitter|single room|studio"), opt("apartment", "Apartments and flats", "apartment|flat|\\d ?-?bed(?:room)?s?|one bedroom|two bedroom|three bedroom"),
    opt("house", "Houses and bungalows", "house|bungalow|maisonette|mansion|villa|townhouse"), opt("land", "Land and plots", "land|plot|acre|eighth|1/8"), opt("commercial", "Shops, offices and stores", "shop|office|stall|godown|warehouse|commercial|store"), opt("hostel", "Hostels", "hostel")]),
  bedrooms: range("bedrooms", "Bedrooms", "bedrooms", [[0, 0, "Bedsitter / studio"], [1, 1, "1 bedroom"], [2, 2, "2 bedrooms"], [3, 3, "3 bedrooms"], [4, null, "4 bedrooms & above"]]),
  propertyFeatures: facet("propertyFeatures", "Features", [choice("water", "Reliable water", "water|borehole|tank"), choice("security", "Security / gated", "security|gated|guard|cctv|electric fence"), choice("parking", "Parking", "parking"),
    choice("tiled", "Tiled", "tiled|tiles"), choice("internet", "Wi-Fi ready", "wi-?fi|fibre|internet"), choice("dsq", "Servant quarter (DSQ)", "\\bdsq\\b|servant"), choice("furnished", "Furnished", "(?<!un)furnished")]),
  transportVehicle: facet("transportVehicle", "Vehicle", [opt("boda", "Boda boda", "boda|motorbike|piki"), opt("tuktuk", "Tuk-tuk", "tuk ?tuk"), opt("taxi", "Taxi / cab", "taxi|cab|car|uber|bolt|little|chauffeur"),
    opt("pickup", "Pick-up and van", "pick-?up|van|probox"), opt("lorry", "Lorry and truck", "lorry|truck|canter|fuso|trailer"), opt("bus", "Matatu, bus and shuttle", "matatu|bus|shuttle|minibus|coaster")]),
  transportService: facet("transportService", "Service", [opt("ride", "Passenger rides", "ride|trip|passenger|airport|transfer|taxi|cab"), opt("parcel", "Parcels and courier", "parcel|courier|package|delivery|errand|document"), opt("moving", "House and office moving", "moving|movers|relocation|shifting"),
    opt("cargo", "Goods and cargo", "cargo|goods|transport of|haulage|construction material"), opt("hire", "Vehicle hire", "hire|self[- ]drive|rental|with driver")]),
  profSpecialty: facet("profSpecialty", "Specialty", [opt("law", "Lawyers and advocates", "lawyer|advocate|legal|conveyancing|affidavit|commissioner for oaths|notary"), opt("accounts", "Accountants and tax", "accountant|accounting|bookkeeping|audit|tax|kra returns|payroll"),
    opt("architect", "Architects and drawings", "architect|house plan|building plan|drawing"), opt("survey", "Surveyors and valuers", "surveyor|survey|valuer|valuation|land search|beacons"), opt("engineer", "Engineers", "engineer|structural"),
    opt("insurance", "Insurance agents", "insurance|cover|policy"), opt("consult", "Business consultants", "consultant|consultancy|business plan|registration|compliance"), opt("events", "Event planners", "event planner|wedding planner|planning")]),
  consultMode: facet("consultMode", "Consultation", [choice("office", "At the office", "office|in person|walk-?in"), choice("online", "Online or by phone", "online|virtual|zoom|phone call|whatsapp|remote"), choice("visit", "Comes to you", "site visit|home visit|we come|on site")]),
  licensed: facet("licensed", "Credentials", [choice("licensed", "Licensed / registered", "licensed|registered|certified|accredited|member of|\\bebk\\b|\\bisk\\b|\\blsk\\b|\\bicpak\\b|\\bnca\\b|\\bepra\\b")]),
  tradeService: facet("tradeService", "Service", [opt("plumbing", "Plumbing", "plumb|pipe|leak|tap|toilet|sink|drain|unblock|water tank|borehole"), opt("electrical", "Electrical wiring", "electric|wiring|rewiring|socket|lighting installation|power"),
    opt("solar", "Solar installation", "solar"), opt("cctv", "CCTV and security", "cctv|alarm|electric fence|security"), opt("painting", "Painting", "paint"), opt("tiling", "Tiling, masonry and gypsum", "tiling|tiler|tiles|mason|gypsum|ceiling|plaster"),
    opt("carpentry", "Carpentry and roofing", "carpent|roof|door fitting|kitchen cabinet"), opt("appliance", "Appliance installation", "install|dstv|tv mounting|cooker|geyser|water heater")]),
  emergency: facet("emergency", "Response", [choice("sameday", "Same day / emergency", "emergency|same day|urgent|24 ?hours?|24/7|call ?out"), choice("quote", "Free quote", "free quote|free quotation|free site visit|free assessment")]),
  fitnessItem: facet("fitnessItem", "Equipment", [opt("weights", "Dumbbells, kettlebells and plates", "dumbbell|kettlebell|barbell|weight plate|plate"), opt("cardio", "Treadmills and exercise bikes", "treadmill|exercise bike|bike|elliptical|rower"),
    opt("mats", "Mats, bands and ropes", "yoga mat|mat|resistance band|band|skipping rope|rope|ab roller"), opt("bench", "Benches, racks and bars", "bench|rack|pull-?up bar|bar")]),
  funeralService: facet("funeralService", "Service", [opt("mortuary", "Mortuary and preservation", "mortuary|preservation|embalm|cold room|morgue"), opt("casket", "Caskets and coffins", "casket|coffin"), opt("hearse", "Hearse and transport", "hearse|transport|van"),
    opt("tent", "Tents, chairs and PA", "tent|chair|pa system|sound"), opt("flowers", "Wreaths and flowers", "wreath|flower"), opt("package", "Full funeral packages", "package|full service|arrangement")])
});

// "What is it" filters are read from the product's name and its own type rows (a spec row named like the filter, or "Type"),
// not from its section or description: a juice on a "Soda and drinks" shelf is not a soda, and a mattress is not a bed.
const BY_NAME = ["accessoryType", "computerAccessory", "storageDevice", "printerType", "applianceType", "lightType", "garment", "bagType", "jewelleryType", "watchType", "eyewearType",
  "fashionAccessory", "garmentMade", "repairDevice", "beautyType", "barberService", "salonService", "massageType", "membership", "drinkType", "liquorType", "bakeType", "breadType",
  "meatType", "produceType", "groceryType", "sweetType", "flowerType", "arrangement", "furnitureType", "tableType", "kitchenType", "textileType", "rugType", "buildMaterial", "paintType",
  "woodType", "electricalType", "autoPart", "carService", "printService", "stationeryType", "penType", "laundryService", "shootType", "eventService", "healthService", "farmType",
  "headphoneType", "speakerType", "agentService", "tuitionLevel", "subject", "drinkPack",
  // sizes and shapes too: "Large double sided whiteboard" in a description is not the board size
  "boardSize", "boardMount", "rugSize", "rugType", "bedSize", "timberSize", "tableShape", "shape", "portion", "sleeve", "mattressType", "lightBase", "cut", "soldBy",
  // the newer "what is it" filters, and a car's make and model (a description saying "please note" is not a Nissan Note)
  "vehicle", "carModel", "bikeMake", "bikePart", "fishType", "birdType", "gasBrand", "grainType", "securityItem", "solarItem", "babyItem", "bookType", "petProduct", "weldItem", "hireItem",
  "roomType", "propertyType", "transportVehicle", "transportService", "profSpecialty", "tradeService", "funeralService", "frameShape", "diaperSize", "fitnessItem"];
for (const id of BY_NAME) FACETS[id].on = "name";

// ---- kinds of product ------------------------------------------------------------------------------------------------
// One entry per kind: id, the label shown under "Department", the store department it sits in (used for related searches),
// the noun for related searches ("JBL speakers"), the words that name it, its filters, and:
//   types    product type ids (scripts/seeds, A24 to A28) whose items are this kind, whatever they are called
//   cats     shop categories (live ids, and the demo's older ids) that sell this kind; used to break ties and as a last resort
//   service  true for services (a haircut, a print, a car wash): they are matched separately from goods
// Order matters within goods and within services: the first kind whose words match wins, so a phone case comes before phones.
// Goods that are also sold used or refurbished get the Condition filter (phones, laptops, furniture, mitumba clothes ...);
// food, medicine and building materials do not.
const SECOND_HAND = new Set(["headphones", "speakers", "tvs", "monitors", "storage-devices", "printers", "computer-accessories", "tablets", "phones", "laptops", "appliances", "batteries", "eyewear", "shoes", "bags", "jewellery", "clothing", "beds", "tables", "carpets", "furniture", "auto-parts", "phone-accessories", "fashion-accessories", "motorbikes", "books", "baby-gear", "security", "solar", "fitness-gear"]);
const kind = (id, label, department, noun, alts, facets, { types = [], cats = [], service = false } = {}) => ({ id, label, department, noun, re: words(alts), facets, types, cats, service, condition: SECOND_HAND.has(id) });

// Filters a kind may place in its own list that are not FACETS entries: they are read from every product (brand, price) or
// from its colours, and the kind's list only says where they go (and, for colour, that the kind has colours at all).
export const PLACED_FACETS = ["brand", "price", "colour"];

export const KINDS = [
  // ---- Electronics and phones (sound first: "speaker with power bank" is a speaker; accessories before the devices they fit)
  kind("headphones", "Headphones and earbuds", "Electronics", "earbuds", "earbud|earphone|headphone|headset|airpod|buds|neckband", ["headphoneType", "brand", "price", "connectivity", "noiseCancel", "battery", "colour", "water"], { types: ["earphones-headphones"], cats: ["phones-accessories", "electronics-appliances", "electronics-computers"] }),
  kind("speakers", "Speakers and sound", "Electronics", "speakers", "speaker|sound ?bar|home theat(?:re|er)|subwoofer|partybox|boombox|woofer|amplifier|sound system|hi-?fi|radio",
    ["speakerType", "brand", "price", "power", "connectivity", "battery", "water", "colour", "audioOutput", "powerSource"], { types: ["speaker-soundbar"], cats: ["electronics-appliances", "electronics-computers"] }),
  kind("phone-accessories", "Phone accessories", "Phones", "phone accessories", "phone case|phone cover|screen protector|tempered glass|glass protector|phone charger|fast charger|charger|charging cable|usb cable|type-?c cable|lightning cable|data cable|aux cable|power ?bank|phone holder|car holder|selfie stick|ring light|pop ?socket|otg",
    ["accessoryType", "fitsPhone", "brand", "price", "connector", "chargerPower", "capacityMah", "cableLength", "colour"], { types: ["phone-case", "screen-protector", "phone-charger", "power-bank", "cable"], cats: ["phones-accessories"] }),
  kind("security", "Security and CCTV", "Security", "CCTV and security", "cctv|security camera|surveillance camera|ip camera|dome camera|bullet camera|dvr|nvr|hikvision|dahua|ezviz|alarm system|burglar alarm|electric fence|fence energi[sz]er|intercom|video doorbell|access control|biometric (?:lock|reader|attendance)|smart lock|motion sensor|smoke detector|gate motor|razor wire|dash ?cam|panic button",
    ["securityItem", "cameraChannels", "cameraMp", "brand", "price", "installation", "connectivity"], { cats: ["security-cctv", "electronics-appliances", "electronics-computers", "plumbing-electrical"] }),
  kind("tvs", "TVs", "Electronics", "TVs", "tv(?! ?(?:stand|unit|mount|bracket|cabinet|table))|television|smart tv|led tv|android tv|decoder", ["screen", "brand", "price", "resolution", "smartPlatform", "connectivity", "warranty"], { types: ["tv"], cats: ["electronics-appliances", "electronics-computers"] }),
  kind("monitors", "Monitors", "Computers", "monitors", "(?<!pressure |baby |heart rate |sugar )monitor|computer screen|display screen", ["monitorSize", "brand", "price", "resolution", "refreshRate", "panel", "monitorPorts"], { cats: ["electronics-computers"] }),
  kind("storage-devices", "USB flash disks and memory cards", "Computers", "flash disks", "flash ?disk|flash drive|pen ?drive|usb drive|usb stick|memory card|micro ?sd|sd card|external hard ?disk|external hdd|portable ssd|external ssd|hard ?disk",
    ["storageDevice", "storage", "brand", "price", "usbVersion"], { types: ["memory-card"], cats: ["electronics-computers", "phones-accessories", "cyber-cafe"] }),
  kind("printers", "Printers and ink", "Computers", "printers", "printer|ink tank|ecotank|toner|ink cartridge|cartridge|ink bottle|printer ink|refill ink",
    ["printerType", "brand", "price", "printerFunctions", "inkType", "connectivity"], { types: ["printer", "ink-toner"], cats: ["electronics-computers", "printing-stationery", "cyber-cafe"] }),
  kind("computer-accessories", "Computer accessories", "Computers", "computer accessories", "keyboard|mouse|mice|router|mifi|wi-?fi extender|range extender|access point|modem|webcam|laptop charger|laptop adapter|laptop bag|usb hub|hdmi cable|vga cable|ups|surge protector|cooling pad",
    ["computerAccessory", "brand", "price", "wireless", "connector", "colour"], { types: ["mouse-keyboard", "router-extender", "laptop-charger"], cats: ["electronics-computers", "cyber-cafe"] }),
  kind("tablets", "Tablets", "Computers", "tablets", "tablet pc|android tablet|kids tablet|educational tablet|ipad|galaxy tab|lenovo tab|tecno tab|tablet (?=\\d|with|wi-?fi|4g|10)", ["brand", "storage", "price", "ram", "tabletScreen", "network", "os", "colour"], { types: ["tablet"], cats: ["phones-accessories", "electronics-computers"] }),
  kind("phones", "Phones", "Phones", "phones", "phone|iphone|galaxy|smartphone|tecno|infinix|itel|redmi|xiaomi|oppo|realme|nokia|feature phone|kabambe|vivo|pixel",
    ["brand", "storage", "price", "ram", "network", "dualSim", "os", "phoneScreen", "colour"], { types: ["phone"], cats: ["phones-accessories"] }),
  kind("laptops", "Laptops and desktops", "Computers", "laptops", "laptop|notebook|macbook|ideapad|latitude|elitebook|thinkpad|probook|vivobook|inspiron|chromebook|desktop|all-in-one|computer(?! (?:table|desk|chair|bag|service|repair|class|lessons?|packages?))|desktop pc|gaming pc|mini pc|pc tower|cpu",
    ["brand", "processor", "ram", "storage", "price", "diskType", "laptopScreen", "os"], { types: ["laptop"], cats: ["electronics-computers", "cyber-cafe"] }),
  kind("appliances", "Home appliances", "Appliances", "appliances", "microwave|fridge|refrigerator|freezer|(?<!pressure )cooker|oven|hot ?plate|electric kettle|kettle|blender|mixer|juicer|food processor|iron box|steam iron|washing machine|fan|heater|water dispenser|air ?fryer|deep fryer|toaster|sandwich maker|rice cooker|vacuum cleaner",
    ["applianceType", "brand", "price", "applianceCapacity", "appliancePower", "applianceFeature", "burners", "colour", "warranty"], { types: ["appliance"], cats: ["electronics-appliances", "home-kitchen"] }),
  kind("lighting", "Bulbs and lighting", "Lighting", "bulbs and lights", "bulb|lamp|light|lights|tube light|floodlight|flood light|security light|led strip|strip light|torch|lantern|chandelier|downlight|bulb holder",
    ["lightType", "lightBase", "lightColour", "lampPower", "powerSource"], { types: ["led-bulb", "light-fitting", "led-strip"], cats: ["electronics-appliances", "plumbing-electrical", "hardware-building"] }),
  kind("solar", "Solar power", "Solar and energy", "solar", "solar panel|solar kit|solar system|solar home system|home solar|solar power|inverter|charge controller|mppt|solar water heater|solar geyser|solar pump|solar battery|solar batteries|lithium battery pack|lifepo4|monocrystalline|polycrystalline",
    ["solarItem", "systemSize", "brand", "price", "chemistry", "installation", "warranty"], { cats: ["electronics-appliances", "plumbing-electrical", "hardware-building", "solar-energy"] }),
  kind("batteries", "Batteries and solar", "Batteries", "batteries", "battery|batteries|cr2032", ["batteryUse", "batterySize", "chemistry", "capacityMah"], { types: ["small-battery", "large-battery"], cats: ["electronics-appliances", "auto-spare-parts", "solar-energy"] }),
  // ---- Fashion
  kind("eyewear", "Glasses and sunglasses", "Eyewear", "sunglasses", "sunglass|shades|spectacle|eyeglass|reading glass|glasses frame|spectacle frame|optical frame|contact lens|blue light glass", ["eyewearType", "gender", "frameShape", "price", "brand", "lensType", "lensFeature", "material", "colour"], { types: ["sunglasses", "frames"], cats: ["optician", "fashion-boutiques"] }),
  kind("shoes", "Shoes", "Shoes", "shoes", "shoe|sneaker|sandal|heels|boot|loafer|slipper|trainer|crocs|open shoe|official shoe|school shoe|flip ?flop", ["shoeSize", "shoeType", "gender", "colour", "price", "brand", "material", "ageGroup"], { types: ["shoes"], cats: ["shoes-cobbler", "fashion-boutiques"] }),
  kind("bags", "Bags and wallets", "Bags", "bags", "handbag|backpack|wallet|purse|tote|suitcase|clutch|duffel|travel bag|laptop bag|school bag|shoulder bag|sling bag|tote bag|gym bag|ladies bag|men'?s bag|sports bag", ["bagType", "colour", "price", "brand", "material", "gender"], { types: ["handbag", "backpack-travel-bag", "wallet-purse"], cats: ["fashion-boutiques"] }),
  kind("jewellery", "Jewellery and watches", "Jewellery", "jewellery", "necklace|chain|bracelet|earring|ring|bangle|pendant|anklet|watch|smart ?watch|jewellery|jewelry", ["jewelleryType", "metal", "price", "purity", "watchType", "gender", "brand"], { types: ["necklace-chain-bracelet", "earrings", "ring", "watch"], cats: ["fashion-boutiques"] }),
  kind("fashion-accessories", "Belts, hats and scarves", "Clothing", "accessories", "belt|hat|cap|beanie|scarf|shawl|bandana|head ?wrap|tie|bow tie|gloves|marvin", ["fashionAccessory", "colour", "gender", "price", "material"], { types: ["belt", "scarf-hat-cap"], cats: ["fashion-boutiques", "tailor-boutique"] }),
  kind("fabric", "Fabric by the metre", "Clothing", "fabric", "fabric|kitenge fabric|ankara fabric|cloth by the metre|per metre|lace fabric|chiffon|material for", ["fabric", "colour", "price", "occasion"], { types: ["fabric-by-metre"], cats: ["tailor-boutique", "fashion-boutiques"] }),
  kind("clothing", "Clothing", "Clothing", "clothes", "dress|gown|shirt|blouse|jeans|trouser|skirt|jacket|sweater|t-shirt|tshirt|tee|suit|kitenge|ankara|hoodie|top|shorts|uniform|kanzu|leggings|abaya|kaftan|pyjama|nightdress|vest|socks|boxer|underwear|bra|mitumba|polo|blazer|coat|cardigan",
    ["clothingSize", "garment", "colour", "price", "gender", "ageGroup", "brand", "sleeve", "fit", "fabric", "occasion"], { types: ["clothing", "dress-shirt", "kids-clothing"], cats: ["fashion-boutiques", "tailor-boutique", "tailors"] }),
  // ---- Beauty and personal care (goods)
  kind("baby-gear", "Baby products", "Baby", "baby products", "diaper|nappy|nappies|pampers|huggies|molfix|baby wipes|wet wipes|feeding bottle|baby bottle|infant formula|formula milk|lactogen|nan (?:1|2|3|optipro|pro)|cerelac|stroller|pram|baby carrier|baby walker|baby bath|steriliser|sterilizer|baby monitor|high chair|car seat|baby toys?|teether|sippy cup|pacifier|baby shawl|receiving blanket|carry ?cot|diaper bag|romper|onesie|baby (?:clothes|set|lotion|oil|powder|jelly|soap|shampoo)",
    ["babyItem", "babyAge", "diaperSize", "brand", "price", "gender", "colour"], { cats: ["baby-shop", "supermarket-minimart", "chemist"] }),
  kind("fragrance", "Perfume and fragrance", "Fragrance", "perfumes", "perfume|fragrance|cologne|eau de parfum|eau de toilette|body spray|oud|edp|edt|deodorant|body mist|roll-?on", ["concentration", "scentFor", "brand", "price", "volumeMl", "authenticity"], { types: ["fragrance"], cats: ["salon-beauty", "chemist", "fashion-boutiques"] }),
  kind("beauty", "Beauty and hair products", "Beauty", "beauty products", "lotion|(?<!ice )cream|shampoo|conditioner|wig|weave|braids hair|braiding hair|hair extension|hair oil|hair food|makeup|lipstick|foundation|serum|soap|nail polish|lashes|relaxer kit|petroleum jelly|vaseline|sunscreen|face wash|body wash|shower gel|beard oil|hair gel",
    ["beautyType", "brand", "price", "hairType", "skinType", "gender", "volumeMl"], { types: ["makeup-skincare", "hair-wigs"], cats: ["salon-beauty", "chemist", "supermarket-minimart", "cosmetics-beauty-products"] }),
  // ---- Home and furniture
  kind("beds", "Beds and mattresses", "Furniture", "beds", "bed(?! ?sheets?| ?covers?| ?spreads?| bugs?| ?linen)|bedframe|bed frame|mattress|bunk|double-?decker|decker|cot|crib|headboard", ["bedType", "bedSize", "price", "mattressThickness", "mattressType", "material", "madeTo", "colour"], { types: ["bed", "mattress"], cats: ["furniture-carpentry", "home-kitchen"] }),
  kind("tables", "Tables and desks", "Furniture", "tables", "table(?! salt| tennis| cloth| mat| lamp| fan| water| wine| spoon)|desk|workstation|study table|computer table|dressing table", ["tableType", "seats", "price", "tableShape", "material", "colour", "madeTo"], { types: ["table"], cats: ["furniture-carpentry", "home-kitchen"] }),
  kind("home-textiles", "Bedding, curtains and towels", "Home", "bedding", "bedsheet|bed sheet|sheet set|duvet|comforter|blanket|quilt|bedcover|pillow|cushion|curtain|sheer|blind|towel|bath mat|bathroom mat|mosquito net",
    ["textileType", "bedSize", "colour", "price", "fabric", "room"], { cats: ["home-kitchen"] }),
  kind("carpets", "Carpets and rugs", "Home", "carpets", "carpet|rug|doormat|door mat|floor mat|runner rug|hallway runner|shaggy", ["rugType", "rugSize", "colour", "price", "shape", "material", "room"], { cats: ["home-kitchen", "furniture-carpentry"] }),
  kind("furniture", "Sofas, chairs and cabinets", "Furniture", "furniture", "sofa|couch|seater|l-?shape|recliner|chair|stool|bench|wardrobe|cabinet|cupboard|shelf|shelves|bookshelf|drawer|dresser|tv stand|tv unit|wall unit|ottoman|pouf|chesterfield",
    ["furnitureType", "seats", "material", "price", "colour", "room", "madeTo"], { types: ["sofa", "chair", "wardrobe-cabinet"], cats: ["furniture-carpentry", "home-kitchen"] }),
  kind("kitchenware", "Kitchen and dining", "Home", "kitchenware", "sufuria|pan|pot|casserole|wok|pressure cooker|plates|dinner plate|side plate|plate set|cup|mug|dinner set|bowl|glass|tumbler|tea set|cutlery|spoon|fork|knife|knives|ladle|utensil|chopping board|grater|container|jar|basin|bucket|jug|lunch box|flask|thermos|water bottle|jiko|charcoal stove|tray|kitchen",
    ["kitchenType", "kitchenMaterial", "price", "brand", "pieces", "capacityL", "colour"], { cats: ["home-kitchen"] }),
  // ---- Building, plumbing and electrical
  kind("timber", "Timber and boards", "Hardware and building", "timber", "timber|plank|lumber|cypress|pine|mahogany|mvule|mninga|blue ?gum|eucalyptus|plywood|ply wood|blockboard|mdf|chipboard|hardboard|rafter|fito|wood|pole|post|beam",
    ["woodType", "timberSize", "timberLength", "price", "treatment"], { types: ["timber"], cats: ["hardware-building", "furniture-carpentry", "hardware"] }),
  kind("electrical-plumbing", "Plumbing and electrical", "Plumbing and electrical", "plumbing and electrical", "cable|wire|electrical wire|twin and earth|socket|switch|plug|breaker|mcb|rcd|consumer unit|db box|extension|multi ?plug|adapter|pipe|ppr|pvc pipe|hdpe|elbow|valve|tap|mixer|shower|sink|water tank|tank|conduit|trunking|meter box",
    ["electricalType", "brand", "price", "cableSize", "pipeSize", "tankCapacity"], { types: ["pipe", "electrical-wire", "socket-switch", "circuit-breaker", "water-tank", "extension-multi-plug", "power-adapter", "travel-adapter", "adapter-converter"], cats: ["plumbing-electrical", "hardware-building", "hardware"] }),
  kind("welding", "Welding and metal work", "Hardware and building", "metal work", "welding|welder|fabrication|(?:metal|steel|sliding|swing|main|pedestrian|wrought iron|compound) gates?|gate fabrication|(?:window|door|security|burglar) grills?|burglar proof(?:ing)?|steel doors?|metal doors?|door frames?|window frames?|tank stands?|tank towers?|carports?|metal shed|steel structures?|balustrades?|hand ?rails?|railings?|trusses",
    ["weldItem", "material", "madeTo", "price", "installation"], { cats: ["welding-fabrication", "hardware-building", "hardware"] }),
  kind("building", "Building materials and tools", "Hardware and building", "building materials", "cement|sand|ballast|hardcore|mabati|iron sheet|roofing sheet|box profile|ridge|gutter|steel bar|rebar|y8|y10|y12|y16|brc|wire mesh|binding wire|nail|screw|bolt|paint|emulsion|gloss|undercoat|primer|varnish|tile|grout|adhesive|hammer|saw|tape measure|spade|jembe|panga|wheelbarrow|trowel|spirit level|drill|grinder|spanner|pliers|padlock|lock|hinge|door|window|glass pane|rope|chain|tool",
    ["buildMaterial", "brand", "price", "paintType", "paintSize", "sheetGauge", "colour", "weight"], { types: ["iron-sheet", "paint", "cement-sand-bags", "tiles", "rope-wire-by-metre", "door-window"], cats: ["hardware-building", "hardware"] }),
  // ---- Auto parts and stationery (goods)
  kind("motorbikes", "Motorbikes and parts", "Auto parts", "motorbike parts", "motorbike|motorcycle|motor ?bike|piki ?piki|boda(?: ?boda)? (?:bike|for sale|parts?|spares?|tyres?)|bajaj|boxer bm|boxer 1[05]0|tvs (?:hlx|star|apache|neo)|haojue|skygo|honda ace|yamaha|kymco|scooter|e-?bike|\\d{2,3} ?cc|helmet|riding gear",
    ["bikeMake", "bikePart", "engineCc", "price", "year", "brand"], { cats: ["motorbike-sales-parts", "auto-spare-parts", "garage-mechanic", "mechanics"] }),
  kind("auto-parts", "Car parts and care", "Auto parts", "car parts", "tyre|tire|rim|tube|car battery|brake pad|brake shoe|brake|oil filter|air filter|filter|engine oil|motor oil|gear oil|atf|coolant|spark plug|wiper|shock absorber|bumper|headlight|tail light|side mirror|clutch|radiator|fan belt|timing belt|bush|car mat|seat cover|car polish|car shampoo",
    ["vehicle", "carModel", "year", "autoPart", "price", "brand", "partCondition", "tyreSize", "oilGrade", "warranty"], { types: ["tyre", "car-battery", "engine-oil", "wiper-blade", "spare-part"], cats: ["auto-spare-parts", "garage-mechanic", "mechanics", "motorbike-sales-parts"] }),
  kind("stationery", "Stationery and office supplies", "Printing and stationery", "stationery", "pen|biro|ballpoint|pencil|crayon|marker|highlighter|exercise book|notebook|counter book|diary|ream|a4 paper|printing paper|photocopy paper|manila|whiteboard|white board|blackboard|chalkboard|notice board|cork board|flip chart|file|folder|envelope|box file|stapler|staples|glue|cello ?tape|tape|scissors|punch|sharpener|eraser|rubber|ruler|maths set|geometry set|calculator|pencil case|chalk|duster|stamp pad|sticky notes",
    ["stationeryType", "brand", "price", "penType", "packCount", "paperSize", "paperWeight", "colour", "boardSize", "boardMount"], { types: ["pens-pencils-markers", "notebooks-exercise-books", "paper-reams", "envelopes-files-folders", "staplers-glue-tape-scissors", "calculator"], cats: ["printing-stationery", "cyber-cafe", "supermarket-minimart"] }),
  // ---- Food and drink
  kind("books", "Books and textbooks", "Books", "books", "(?<!exercise |counter |receipt |cheque |note |log |guest |phone |address |story )book(?! ?shelf| ?case| ?stand| ?mark| ?end)|textbook|storybook|story book|novel|revision|past papers?|dictionary|atlas|bible|quran|encyclopedia|workbook|course book|set book",
    ["bookType", "bookLevel", "subject", "price", "curriculum", "publisher"], { cats: ["printing-stationery", "bookshop", "supermarket-minimart"] }),
  kind("liquor", "Beer, wine and spirits", "Food and drink", "drinks", "beer|lager|stout|tusker|guinness|white cap|balozi|cider|wine|whisky|whiskey|vodka|gin|brandy|cognac|rum|liqueur|amarula|baileys|spirit|savanna|hunters|smirnoff|jameson|johnnie walker|kenya cane|chrome",
    ["liquorType", "brand", "bottleSize", "price", "abv", "drinkPack"], { types: ["liquor"], cats: ["supermarket-minimart", "wines-spirits-bar"] }),
  kind("bakery", "Bread, cakes and pastries", "Food and drink", "bread and cakes", "bread|loaf|cake|cupcake|muffin|pastry|pastries|doughnut|donut|croissant|mandazi|maandazi|scone|cookie|bun|baguette|queen cake|black forest|red velvet",
    ["bakeType", "flavour", "weight", "price", "cakeOccasion", "dietary", "breadType", "turnaround"], { types: ["bread", "cake", "cupcakes-pastries"], cats: ["bakery"] }),
  kind("sweets", "Chocolates and sweets", "Food and drink", "chocolates", "chocolate|cadbury|dairy milk|kitkat|snickers|ferrero|toblerone|truffle|pralines|sweet(?! potato| corn| pepper| melon| red| white| wine)|ice cream|candy|lollipop|toffee|chewing gum|gum|jelly bean|marshmallow",
    ["sweetType", "brand", "price", "gift", "packWeight", "dietary"], { cats: ["supermarket-minimart", "groceries", "bakery"] }),
  kind("drinks", "Soda, juice and drinks", "Food and drink", "drinks", "soda|soft drink|coke|coca-?cola|fanta|sprite|pepsi|mirinda|krest|stoney|novida|7up|schweppes|juice|smoothie|energy drink|red bull|monster|predator|power play|bottled water|mineral water|dasani|keringet|milkshake|yoghurt|yogurt|mala|lala|fresh milk|milk|soya drink|minute maid|afia|quencher|squash|cordial",
    ["drinkType", "drinkSize", "brand", "price", "fruit", "drinkPack", "dietary"], { types: ["juice"], cats: ["juice-shop", "supermarket-minimart", "groceries", "restaurant-cafe"] }),
  kind("meals", "Meals and restaurant menu", "Food and drink", "meals", "pilau|biryani|plate of|full plate|half plate|meal deal|set meal|kids meal|menu|ugali|chapati and|chips|fries|burger|pizza|hot ?dog|shawarma|samosa|smokie|sausage|bhajia|fried rice|noodle|stew|nyama choma|fish fry|wa kupaka|mukimo|githeri|matoke|pilau beef|chicken curry|beef curry|beans and|rice and|breakfast|lunch|dinner|combo|platter|chai|tea and|coffee and|mandazi and|full plate|half plate|kienyeji",
    ["cuisine", "protein", "price", "portion", "mealTime", "dietary"], { types: ["restaurant-meal"], cats: ["restaurant-cafe", "eateries"] }),
  kind("fish", "Fish and seafood", "Food and drink", "fish", "fish(?! ?food| ?feed| ?tank| ?bowl| ?net| ?hook| ?pond| ?oil)|tilapia|omena|dagaa|nile perch|mbuta|samaki|cat ?fish|kamongo|sardines?|mackerel|prawns?|shrimps?|seafood|octopus|squid|lobster|salmon|hake|fish fillet",
    ["fishType", "fishPrep", "fishCut", "weight", "price", "soldBy"], { cats: ["fish-mama-mboga", "butchery", "greengrocer", "supermarket-minimart"] }),
  kind("poultry", "Poultry and eggs", "Farm", "poultry", "chicks?(?![a-z]| ?mash| ?feed| ?starter| ?mesh)|day-?old|layers?(?![a-z]| ?mash| ?pellets| ?feed| ?concentrate| ?cake)|point of lay|pullets?|cockerels?|hens?|roosters?|kuroiler|kenbro|rainbow rooster|sasso|live (?:chicken|bird|broiler|kienyeji)s?|egg trays?|trays? of eggs|fertil(?:e|ised) eggs|incubator|ducks?|ducklings?|turkeys?|quails?|guinea fowls?|kienyeji (?:hen|cock|chicks|eggs)",
    ["birdType", "birdAge", "birdBreed", "price", "liveDressed", "eggPack", "weight", "vaccinated"], { cats: ["poultry-shop", "agrovet", "agrovets"] }),
  kind("meat", "Meat and fish", "Food and drink", "meat", "beef|goat|mbuzi|mutton|lamb|chicken|kienyeji|broiler|pork|bacon|mince|steak|ribs|sausages|smokies|liver|matumbo|offal",
    ["cut", "weight", "meatType", "price", "meatState", "soldBy", "dietary"], { types: ["meat-by-weight"], cats: ["butchery", "fish-mama-mboga"] }),
  kind("produce", "Fruit and vegetables", "Food and drink", "fruit and vegetables", "tomato|onion|sukuma|kale|cabbage|spinach|carrot|potato|pepper|managu|terere|banana|mango|orange|apple|avocado|pawpaw|pineapple|watermelon|passion fruit|lemon|dhania|garlic|ginger|egg|fruit|vegetable|mboga",
    ["produceType", "soldBy", "weight", "price", "produceOrigin"], { types: ["produce"], cats: ["greengrocer", "groceries", "fish-mama-mboga"] }),
  kind("cereals", "Cereals and grains", "Food and drink", "cereals", "maize(?! ?meal| ?flour| ?seeds?)|dry maize|(?<!baked |coffee |jelly |cocoa |green |french )bean(?! ?seeds?)|green grams?|ndengu|dengu|njahi|sorghum|millet|wimbi|mtama|cowpeas|pigeon peas|groundnuts|njugu|posho mill|posho milling|githeri mix",
    ["grainType", "milling", "weight", "price"], { cats: ["posho-mill-cereals", "groceries", "supermarket-minimart", "greengrocer"] }),
  kind("water", "Drinking water", "Water and energy", "water", "water refill|drinking water|purified water|jerrican|\\d+ ?(?:l|litres?) refill|refill water", ["waterSize", "waterType", "fill", "price", "brand", "waterPlan"], { types: ["drinking-water"], cats: ["water-refill"] }),
  kind("gas", "Cooking gas (LPG)", "Water and energy", "gas", "gas|lpg|cylinder|meko|regulator|gas burner|k-?gas|total gas|pro ?gas|afrigas|hashi", ["cylinderSize", "gasService", "gasBrand", "price"], { types: ["lpg-gas"], cats: ["lpg-gas"] }),
  kind("groceries", "Groceries and pantry", "Food and drink", "groceries", "flour|unga|maize meal|sugar|salt|rice|pasta|spaghetti|noodle|cooking oil|oil|cooking fat|kimbo|tea leaves|tea bags|ketepa|kericho gold|green tea|coffee|cocoa|spice|masala|royco|ketchup|sauce|cereal|cornflakes|oats|porridge|butter|margarine|blue band|cheese|biscuit|crisps|nuts|detergent|soap|bleach|tissue|toilet paper|omo|ariel|sunlight|jik|matches|beans|lentils|ndengu|honey|jam|peanut butter|baking powder|yeast",
    ["groceryType", "brand", "packWeight", "price", "packVolume", "dietary"], { types: ["packaged-food"], cats: ["supermarket-minimart", "groceries", "posho-mill-cereals"] }),
  kind("flowers", "Flowers and gifts", "Gifts", "flowers", "flower|rose|bouquet|lily|lilies|sunflower|carnation|orchid|potted plant|plant|succulent|wreath|hamper|gift basket|gift box",
    ["flowerType", "arrangement", "giftOccasion", "price", "stems", "colour"], { cats: ["photography-events", "supermarket-minimart"] }),
  // ---- Health and farm
  kind("medicine", "Medicine and health products", "Medicine and health", "pharmacy products", "tablet|tablets|capsule|syrup|paracetamol|ibuprofen|panadol|amoxicillin|cetirizine|ointment|vitamin|multivitamin|zinc|test kit|condom|sanitiser|sanitizer|mask|thermometer|pressure monitor|glucometer|glucose strips|first aid|pregnancy test|ors|oral rehydration|antiseptic|bandage|plaster|cough|inhaler|eye drops|\\d+ ?mg",
    ["healthUse", "dosageForm", "price", "brand", "prescription", "ageGroup"], { types: ["medicine", "prescription-medicine"], cats: ["chemist", "chemists", "clinic"] }),
  kind("pets", "Pet food and supplies", "Pets", "pet supplies", "dog food|cat food|puppy food|pet food|(?<!hot )dog|puppy|puppies|cat(?! ?eye| ?walk| ?fish)|kitten|pet|cat litter|bird seed|bird cage|fish food|aquarium|fish tank|kibble|pedigree|whiskas|kennel|pet shop|pet grooming|dog grooming",
    ["petAnimal", "petProduct", "brand", "price", "weight"], { cats: ["pet-shop-vet", "agrovet", "agrovets"] }),
  kind("fitness-gear", "Fitness equipment", "Fitness", "fitness equipment", "dumbbells?|kettlebells?|barbells?|treadmills?|yoga mats?|skipping ropes?|resistance bands?|exercise bikes?|weight plates?|bench press|gym bench(?:es)?|pull-?up bars?|ab rollers?",
    ["fitnessItem", "brand", "price", "weight"], { cats: ["gym-fitness"] }),
  kind("farm", "Farm inputs", "Farm inputs", "farm inputs", "seed|seeds|fertili[sz]er|dap|can fertili[sz]er|can 26|npk|urea|feed|dairy meal|layers mash|chick mash|growers|mash|pellets|dewormer|acaricide|pesticide|herbicide|fungicide|insecticide|sprayer|knapsack|vaccine|vet|mineral lick|maclick|drip kit",
    ["farmType", "farmUse", "brand", "price", "weight", "farmForm"], { types: ["vet-medicine", "agrochemicals", "agrovet-supplies"], cats: ["agrovet", "agrovets", "poultry-shop"] }),
  // ---- Services (matched separately from goods)
  kind("barber", "Barber services", "Hair and beauty", "barbers", "haircut|hair cut|cut|fade|taper|beard|line-?up|shave|kids cut|chiskop|dreadlock|locs|retwist|hair dye|scalp massage|hot towel", ["barberService", "serviceFor", "price", "duration", "homeService", "booking"],
    { types: ["barbershop-service"], cats: ["barbershop", "barbershops"], service: true }),
  kind("salon", "Salon services", "Hair and beauty", "salons", "braid|braids|cornrow|knotless|twist|wig install|wig|weave|sew-?in|frontal|relaxer|retouch|wash and blow-?dry|blow-?dry|silk press|styling|manicure|pedicure|gel nails|acrylic|nails|makeup|lashes|brows|waxing|facial|hair treatment|steam",
    ["salonService", "serviceFor", "price", "hairLength", "hairType", "duration", "homeService", "booking"], { types: ["salon-service"], cats: ["salon-beauty", "salons"], service: true }),
  kind("spa", "Spa and massage", "Hair and beauty", "massages", "massage|spa|reflexology|aromatherapy|hot stone|deep tissue|swedish|body scrub|sauna|steam bath|body wrap", ["massageType", "duration", "price", "serviceFor", "homeService", "booking"],
    { types: ["spa-treatment"], cats: ["spa-massage"], service: true }),
  kind("tailoring", "Tailoring and dress making", "Clothing", "tailors", "tailor|tailoring|dress making|dressmaking|made to measure|made-to-measure|custom made|alteration|hemming|stitching|sewing|dress|gown|suit|kitenge|outfit|uniform|trouser|shirt|jeans|kids outfits",
    ["garmentMade", "gender", "price", "turnaround", "fabricSupply"], { types: ["tailoring"], cats: ["tailor-boutique", "tailors"], service: true }),
  kind("shoe-repair", "Shoe repair", "Shoes", "shoe repair", "shoe repair|cobbler|resole|sole|heel repair|stitching|shoe polish|shoe shine|bag repair|zip repair", ["repairType", "price", "turnaround"], { types: ["shoe-repair"], cats: ["shoes-cobbler"], service: true }),
  kind("trades", "Plumbers, electricians and fundis", "Plumbing and electrical", "fundis", "plumbers?|plumbing (?:services?|repairs?|works?)|electricians?|(?:house |electrical )?(?:re)?wiring|fundis?|borehole (?:drilling|services?)|tank (?:installation|cleaning)|(?:solar|cctv|electric fence|alarm|gate motor|dstv|water heater|geyser|shower) installation|installation of|painting services?|house painting|painters?|tiling|tilers?|masonry|masons?|gypsum (?:ceiling|works?)|ceiling installation|carpenters?|carpentry services?|roofing services?|leak repairs?|pipe repairs?|unblocking|toilet repairs?",
    ["tradeService", "emergency", "price", "homeService", "licensed"], { cats: ["plumbing-electrical", "hardware-building", "hardware", "trades"], service: true }),
  kind("repairs", "Phone, laptop and appliance repair", "Repairs", "repairs", "repair|screen replacement|battery replacement|charging port|unlock|flashing|software|laptop service|servicing|fixing|fix|water damage|installation|tv mounting",
    ["repairDevice", "repairType", "price", "partQuality", "turnaround", "warranty", "homeService"], { types: ["phone-repair"], cats: ["phone-repair", "electronics-appliances", "electronics-computers"], service: true }),
  kind("printing", "Printing and cyber services", "Printing and stationery", "printing", "print|printing|photocopy|copy|scan|scanning|lamination|laminate|binding|typing|passport photo|banner|poster|business card|flyer|invitation card|sticker|branding|ecitizen|kra|itax|nhif|sha|helb|kuccps|good conduct|online application|internet|browsing|cv writing",
    ["printService", "paperSize", "colourMode", "price", "paperWeight", "printSides", "bindingType", "finish", "turnaround"], { types: ["printing", "scanning", "lamination", "binding", "typing-documents", "passport-photos", "banners-posters-cards", "computer-internet-use"], cats: ["cyber-cafe", "printing-stationery", "mpesa"], service: true }),
  kind("laundry", "Laundry and cleaning", "Cleaning", "laundry", "laundry|wash and fold|dry ?clean|ironing|duvet cleaning|carpet cleaning|sofa cleaning|house cleaning|office cleaning|deep cleaning|fumigation|cleaning", ["laundryService", "pricedBy", "price", "turnaround", "pickup"],
    { types: ["laundry-by-weight", "laundry-by-item"], cats: ["cleaning-laundry"], service: true }),
  kind("car-services", "Car wash and garage", "Auto", "car services", "car wash|wash|valet|detailing|interior cleaning|engine wash|seat cleaning|service|oil change|diagnostic|diagnostics|repair|wheel alignment|balancing|panel beating|spray painting|tuning|towing",
    ["carService", "vehicleClass", "price", "vehicle", "duration", "homeService"], { types: ["garage-service", "car-wash"], cats: ["car-wash", "garage-mechanic", "mechanics", "auto-spare-parts"], service: true }),
  kind("gym", "Gym and fitness", "Fitness", "gym memberships", "membership|day pass|weekly pass|pass|monthly|weekly|quarterly|annual|personal training|trainer|class|aerobics|zumba|yoga|spinning|boxing|karate|swimming|fitness|gym|locker", ["membership", "membershipFor", "price", "duration"],
    { types: ["gym-membership"], cats: ["gym-fitness", "gyms"], service: true }),
  kind("health-services", "Health checks and clinic services", "Medicine and health", "health checks", "blood pressure|sugar test|test|check|checkup|check-up|screening|consultation|vaccination|eye test|eye exam|dental|lab|malaria test|hiv test|scan|ultrasound",
    ["healthService", "price", "booking", "homeService", "duration"], { cats: ["clinic", "chemist", "chemists", "optician"], service: true }),
  kind("event-hire", "Event hire and services", "Events", "event hire", "tents?(?! ?pegs?)|tent hire|marquees?|chairs? hire|tables? hire|sound hire|sound system hire|pa system|public address|decor|décor|decorations?|stage hire|red carpet|portable toilets?|mobile toilets?|tiffany chairs?|chiavari|chafing dish(?:es)?|catering|mc|emcee|dj|event hire|hire for events",
    ["hireItem", "setup", "price"], { cats: ["photography-events", "event-hire"], service: true }),
  kind("photography", "Photography and events", "Events", "photographers", "photo|photography|photographer|video|videography|shoot|wedding|event|package|drone shots?|aerial", ["shootType", "coverage", "price", "deliverables", "duration"],
    { types: ["photo-package"], cats: ["photography-events"], service: true }),
  kind("tuition", "Tuition and daycare", "Education", "tuition", "tuition|tutor|lesson|class|daycare|day care|pre-?school|kindergarten|homework|coaching|driving lesson|music lesson|holiday tuition", ["tuitionLevel", "subject", "curriculum", "price", "lessonMode"], { cats: ["tuition-daycare"], service: true }),
  kind("money", "M-Pesa, airtime and payments", "Money", "money services", "m-?pesa|deposit|withdraw|airtime|bundle|data bundle|tokens|bill payment|agent banking|send money", ["agentService", "mobileNetwork"], { cats: ["mpesa-airtime-agent", "mpesa"], service: true }),
  kind("funeral", "Funeral services", "Funeral services", "funeral services", "funerals?|mortuary|morgue|caskets?|coffins?|hearse|body preservation|embalming|cremation|burial|memorial service|requiem",
    ["funeralService", "price", "booking"], { cats: ["funeral-services"], service: true }),
  kind("transport", "Transport and delivery", "Transport", "transport", "boda ?boda(?! (?:bike|for sale|parts?|spares?|tyres?))|(?:boda|taxi|cab) rides?|taxi|cabs?|uber|matatu|shuttle|tuk ?tuk|pick-?up hire|lorry|lorries|truck hire|canter hire|moving|movers|relocation|house moving|office moving|parcels?|courier|delivery service|errands?|airport transfers?|car hire|car rental|vehicle hire|vehicle rental|self drive|chauffeur|transport|haulage|pick-?up truck",
    ["transportVehicle", "transportService", "price", "booking"], { cats: ["transport-logistics"], service: true }),
  kind("property", "Houses, rooms and land", "Property", "property", "for rent|to let|to-let|rental|bed-?sitters?|\\d ?-?(?:bedroom|br|bhk)s?|one bedroom|two bedroom|three bedroom|apartments?|flat to let|house for (?:rent|sale)|plots? for sale|plots?|land for sale|acres?|office space|shop space|godown|warehouse|hostels?|maisonettes?|bungalows?|rental house|land for sale|for sale",
    ["dealType", "propertyType", "bedrooms", "price", "propertyFeatures"], { cats: ["rentals-real-estate"], service: true }),
  kind("stays", "Hotels, rooms and venues", "Hospitality", "rooms and venues", "hotel room|lodging|lodge|accommodation|guest ?house|bnb|b&b|airbnb|per night|a night|night stay|overnight stay|suite|cottage|resort|motel|(?:single|double|twin|deluxe|executive|standard|family) rooms?|conference (?:room|hall)|boardroom hire|venue hire|event venue|bed and breakfast|apartment stay",
    ["roomType", "price", "guests", "amenities", "booking"], { cats: ["hotels-lodging"], service: true }),
  kind("professional", "Professional services", "Professional services", "professionals", "lawyers?|advocates?|legal|conveyancing|affidavits?|commissioner for oaths|notary|accountants?|accounting|bookkeeping|audit(?:ing)?|tax (?:filing|returns|consult(?:ant|ing)?)|kra returns|payroll|architects?|architectural|house plans?|building plans?|surveyors?|surveying|land survey|valuers?|valuation|land search|engineers?|structural|consultants?|consultancy|insurance(?: agent| cover| broker)?|event planners?|wedding planners?|interior design(?:er)?|business plans?|company registration|business registration",
    ["profSpecialty", "consultMode", "price", "licensed"], { cats: ["professional-services"], service: true }),
  kind("services", "Other services", "Services", "services", "service|session|installation|hire|booking|appointment|delivery|errand", ["booking", "duration", "price", "homeService"], { cats: ["welding-fabrication", "event-hire", "professional-services"], service: true })
];

// Shop categories whose items are mostly services: there a word like "makeup" or "braids" means the service, not a product.
export const SERVICE_CATEGORIES = new Set(["barbershop", "barbershops", "salon-beauty", "salons", "spa-massage", "gym-fitness", "gyms", "car-wash", "garage-mechanic", "mechanics",
  "cleaning-laundry", "cyber-cafe", "mpesa", "mpesa-airtime-agent", "photography-events", "tuition-daycare", "clinic", "phone-repair", "tailors",
  "event-hire", "hotels-lodging", "rentals-real-estate", "transport-logistics", "professional-services", "funeral-services"]);

// The catalogue coverage types (data/coverageKinds.js) join their kind's own list of product types.
for (const [kindId, ids] of Object.entries(COVERAGE_TYPE_KINDS)) {
  const k = KINDS.find((x) => x.id === kindId);
  if (!k) throw new Error(`coverageKinds: unknown kind ${kindId}`);
  k.types = [...k.types, ...ids];
}

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));

/** Product type id (scripts/seeds) -> its kind. Every seeded type belongs to exactly one kind (search.test.js checks it). */
export const KIND_BY_TYPE = Object.fromEntries(KINDS.flatMap((k) => k.types.map((t) => [t, k])));

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
