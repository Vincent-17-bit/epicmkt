// Approved open values (A18 dictionary) shipped with the catalogue coverage work: the brands, materials, colours, finishes and flavours
// that Kenyan shops sell most, so a seller picks from a list instead of typing and buyers get one filter choice per value.
// Every label goes through validateOpenValue in the tests. The migration inserts them as approved and skips any that already exist.
// Colours carry a hex shade for the swatch; "Multicolour" and "Transparent" have none.

const list = (kind, labels, extra = {}) => labels.map((label) => ({ kind, label, ...extra }));
const colours = (pairs) => pairs.map(([label, hex]) => ({ kind: "color", label, ...(hex ? { hex } : {}) }));

const BRANDS = [
  // Food, drink and household
  "Total", "K-Gas", "Afrigas", "Hashi Energy", "ProGas", "Taifa Gas", "Lake Gas", "Oryx", "Rubis", "Shell Gas", "Ola Energy", "MGas",
  "Dasani", "Keringet", "Highlands", "Aquamist", "Quencher", "Kilimanjaro",
  "Coca-Cola", "Fanta", "Sprite", "Pepsi", "Mirinda", "7UP", "Stoney", "Krest", "Minute Maid", "Del Monte", "Pick N Peel", "Afia", "Ribena", "Predator", "Monster", "Red Bull",
  "Soko", "Jogoo", "Pembe", "Dola", "Hostess", "Exe", "Fresh Fri", "Elianto", "Golden Fry", "Rina", "Pika", "Kimbo", "Prestige",
  "Mumias", "Kabras", "Sony Sugar", "Chemelil", "Nzoia", "West Kenya", "Butali", "Pishori", "Daawat", "Tilda", "Kensalt",
  "Kericho Gold", "Ketepa", "Chai Fahari", "Brooke Bond", "Tetley", "Dormans", "Nescafe", "Africafe", "Java",
  "Brookside", "Tuzo", "Fresha", "Daima", "Githunguri", "Bio", "New KCC", "Broadway", "Festive", "Superloaf",
  "Sunlight", "Omo", "Ariel", "Jamaa", "Toss", "Menengai", "Kleesoft", "Geisha", "Dettol", "Harpic", "Jik", "Vim", "Rosy", "Flora", "Kleenex",
  // Health, baby and beauty
  "Panadol", "Piriton", "Strepsils", "Betadine", "Vicks", "Always", "Kotex", "Huggies", "Pampers", "Softcare", "Molfix", "Johnson's", "Nivea", "Vaseline", "Dove", "Oral-B", "Colgate", "Aquafresh", "Sensodyne", "Cussons", "Lux",
  "Cerelac", "Nan", "Lactogen", "Similac", "Enfamil", "Aptamil", "SMA", "Nutrilon", "Tommee Tippee", "Philips Avent", "Chicco", "Pigeon", "Mamas and Papas",
  "Dark and Lovely", "Cantu", "Shea Moisture", "Black Opal", "Revlon", "Maybelline", "L'Oreal", "MAC", "Fenty Beauty", "Garnier", "Olay", "Ambi", "Fair and White", "Carolight", "Sofn'free", "Dudu Osun", "Eco Style", "Mielle", "OPI", "Essie", "Rexona", "Axe", "Brut", "Old Spice",
  "Darling", "Xpression", "Rastafri", "Sensationnel", "Outre",
  // Phones, electronics and appliances
  "Samsung", "Tecno", "Infinix", "Itel", "Xiaomi", "Redmi", "Oppo", "Realme", "Vivo", "Nokia", "Apple", "Huawei", "Honor", "Google Pixel", "OnePlus", "Motorola", "Oraimo", "Anker",
  "Hisense", "LG", "Sony", "TCL", "Skyworth", "Vitron", "Ramtons", "Von", "Mika", "Nunix", "Philips", "Panasonic", "Toshiba", "Bruhm", "Sayona", "Syinix", "Haier", "Whirlpool", "Bosch", "Beko", "Midea", "Hotpoint", "Binatone", "Kenwood", "Russell Hobbs", "Tefal", "Black and Decker",
  "HP", "Dell", "Lenovo", "Asus", "Acer", "Microsoft", "Canon", "Epson", "Brother", "Kyocera", "Logitech", "TP-Link", "D-Link", "SanDisk", "Kingston", "Seagate", "Western Digital",
  // Solar, security and energy
  "Jinko", "Trina Solar", "Canadian Solar", "Longi", "JA Solar", "Victron Energy", "Growatt", "Deye", "Must", "Felicity", "Sungrow", "Luminous", "Exide", "Chloride Exide", "Yuasa", "Power Sonic", "Ritar", "EcoFlow", "Jackery", "d.light", "Sun King", "M-KOPA",
  "Hikvision", "Dahua", "Reolink", "Ezviz", "Imou", "Uniview", "TVT",
  // Hardware, building, trades
  "Makita", "DeWalt", "Stanley", "Hilti", "Ingco", "Yale", "Union", "Chubb", "Abus", "Master Lock", "Osram", "Eveready",
  "Crown Paints", "Basco", "Sadolin", "Galaxy Paints", "Dulux", "Duracoat", "Sako", "Berger", "Plascon", "Hempel",
  "Bamburi", "Savannah Cement", "Mombasa Cement", "Simba Cement", "Rhino Cement", "Blue Triangle", "Ndovu", "National Cement", "Tembo",
  "Mabati Rolling Mills", "Safal", "Roofings Rolling Mills", "Tononoka", "Kenpipe", "Kentank", "Superlife", "Kenpoly", "Sintex", "East African Cables",
  // Agriculture, poultry and pets
  "Syngenta", "Bayer", "Elgon Kenya", "Osho Chemical", "Twiga Chemicals", "Amiran Kenya", "Kenya Seed Company", "Simlaw Seeds", "Pioneer", "Pannar", "Western Seed", "East African Seed", "Yara", "MEA Fertilizer",
  "Unga Farm Care", "Pembe Feeds", "Sigma Feeds", "Maclick", "Kenchic", "Hy-Line", "Norbrook", "Cosmos", "Interchemie",
  "Pedigree", "Whiskas", "Royal Canin", "Purina", "Hill's Science Diet", "Drools", "Cesar",
  // Fashion, eyewear and accessories
  "Nike", "Adidas", "Puma", "Reebok", "New Balance", "Converse", "Vans", "Skechers", "Bata", "Clarks", "Crocs", "Fila", "Under Armour", "Levi's", "Zara", "H&M", "Mr Price", "Truworths", "Woolworths",
  "Casio", "Seiko", "Citizen", "Fossil", "Timex", "G-Shock", "Samsonite", "American Tourister", "Eastpak", "JanSport",
  "Ray-Ban", "Oakley", "Essilor", "Zeiss", "Hoya", "Acuvue", "Bausch and Lomb", "Air Optix",
  // Home and furniture
  "Dunlopillo", "Vono", "Pyrex", "Tupperware", "Hawkins",
  // Auto, motorbikes, tyres
  "Toyota", "Nissan", "Honda", "Mazda", "Subaru", "Mitsubishi", "Suzuki", "Isuzu", "Ford", "Volkswagen", "Mercedes-Benz", "BMW", "Audi", "Hyundai", "Kia", "Land Rover", "Peugeot", "Renault",
  "Bridgestone", "Michelin", "Goodyear", "Dunlop", "Continental", "Yokohama", "Pirelli", "Hankook", "Kumho", "Firestone", "Maxxis", "Falken", "Toyo", "Roadstone", "Linglong", "Triangle", "Sailun", "Westlake",
  "Castrol", "Mobil", "Shell Helix", "Total Quartz", "Valvoline", "Caltex Havoline", "Motul", "Liqui Moly", "Gulf", "Amaron", "Varta",
  "Bajaj", "Boxer", "TVS", "Hero", "Haojue", "Skygo", "Sanlg", "Kymco", "Piaggio", "Royal Enfield", "Yamaha", "Studds", "LS2", "AGV", "HJC",
  // Drinks and liquor
  "Tusker", "White Cap", "Guinness", "Pilsner", "Balozi", "Heineken", "Castle Lager", "Savanna", "Hunters Gold", "Smirnoff", "Johnnie Walker", "Jameson", "Jack Daniel's", "Chrome", "Kenya Cane", "Gilbeys", "Captain Morgan", "Hennessy", "Four Cousins", "Robertson", "Drostdy-Hof", "Nederburg",
  // Books, stationery, services
  "Kenya Literature Bureau", "Longhorn Publishers", "Oxford University Press", "Moran Publishers", "Jomo Kenyatta Foundation", "East African Educational Publishers", "Phoenix Publishers",
  "Bic", "Pilot", "Faber-Castell", "Staedtler",
  "Safaricom", "Airtel", "Telkom", "Faiba"
];

const MATERIALS = [
  ...list("material", ["Mahogany", "Cypress", "Pine", "Mvule", "Meru oak", "Eucalyptus", "Cedar", "Teak", "Mukau", "Muhugu", "Olive wood", "Bamboo", "Rattan", "Wicker", "Sisal", "Jute", "Cane", "Papyrus"]),
  ...list("material", ["MDF", "Plywood", "Blockboard", "Chipboard", "Particle board", "Melamine board", "Hardboard"]),
  ...list("material", ["Mild steel", "Stainless steel", "Aluminium", "Galvanised steel", "Cast iron", "Brass", "Copper", "Bronze", "Iron", "Zinc", "Chrome plated"]),
  ...list("material", ["Gold", "Gold plated", "Silver", "Sterling silver", "Rose gold", "Platinum"], { tags: ["precious-metal"] }),
  ...list("material", ["Cotton", "Linen", "Silk", "Satin", "Polyester", "Nylon", "Wool", "Denim", "Leather", "Faux leather", "Suede", "Velvet", "Chiffon", "Lace", "Ankara", "Kitenge", "Kanga", "Kikoy", "Fleece", "Corduroy", "Jersey", "Spandex", "Rayon", "Viscose", "Tweed", "Khaki drill", "Gabardine", "Tulle", "Organza", "Crepe", "Canvas"]),
  ...list("material", ["Plastic", "PVC", "HDPE", "PET", "Polypropylene", "ABS", "Acrylic", "Silicone", "Rubber", "High density foam", "Memory foam", "Latex"]),
  ...list("material", ["Glass", "Ceramic", "Porcelain", "Granite", "Marble", "Concrete", "Clay", "Stone"]),
  ...list("material", ["Paper", "Cardboard", "Kraft paper", "Vinyl", "Flex banner", "Foam board", "Sticker vinyl"]),
  ...list("material", ["Lithium-ion", "Lead acid", "Gel", "AGM", "Monocrystalline silicon", "Polycrystalline silicon"])
];

const COLOURS = colours([
  ["Black", "#111111"], ["White", "#ffffff"], ["Grey", "#9ca3af"], ["Charcoal", "#36454f"], ["Silver", "#c0c0c0"], ["Navy blue", "#1b2a49"], ["Royal blue", "#2c5fcc"], ["Sky blue", "#7ec8e3"],
  ["Turquoise", "#30d5c8"], ["Teal", "#008080"], ["Green", "#2e8b57"], ["Olive", "#6b8e23"], ["Lime", "#a4d233"], ["Mint", "#98ff98"], ["Yellow", "#f6e05e"], ["Mustard", "#e1ad01"],
  ["Gold", "#d4af37"], ["Orange", "#f28c28"], ["Coral", "#ff7f50"], ["Red", "#c0262d"], ["Maroon", "#800000"], ["Burgundy", "#800020"], ["Wine", "#722f37"], ["Pink", "#f4b6c2"],
  ["Hot pink", "#ff69b4"], ["Fuchsia", "#d6249f"], ["Purple", "#6a0dad"], ["Lavender", "#b497d6"], ["Violet", "#8f00ff"], ["Brown", "#6b4f3a"], ["Chocolate", "#3d2314"], ["Tan", "#d2b48c"],
  ["Beige", "#d6c7a8"], ["Cream", "#fffdd0"], ["Khaki", "#c3b091"], ["Camel", "#c19a6b"], ["Rose gold", "#b76e79"], ["Bronze", "#cd7f32"], ["Copper", "#b87333"], ["Nude", "#e3bc9a"],
  ["Peach", "#ffdab9"], ["Ivory", "#fffff0"], ["Blush", "#f4c2c2"], ["Multicolour", null], ["Transparent", null]
]);

const FINISHES = list("finish", [
  "Matt", "Gloss", "Satin", "Brushed", "Polished", "Chrome", "Powder coated", "Anodised", "Galvanised", "Painted", "Varnished", "Lacquered", "Natural", "Oiled", "Waxed", "Textured", "Embossed",
  "Matt lamination", "Gloss lamination", "Frosted", "Antique", "Black oxide", "Nickel plated", "Brass finish", "Stainless finish", "Rustic", "Distressed", "Veneer", "Primed", "Sandblasted", "Hammered"
]);

const FLAVOURS = list("flavour", [
  "Vanilla", "Chocolate", "Strawberry", "Banana", "Mango", "Passion", "Pineapple", "Orange", "Lemon", "Apple", "Blueberry", "Coconut", "Coffee", "Caramel", "Red velvet", "Black forest", "Carrot",
  "Lemon drizzle", "Marble", "Fruit cake", "Cheesecake", "Oreo", "Mint", "Tamarind", "Ginger", "Pilau masala", "Spicy", "Plain", "Salted", "BBQ", "Cheese", "Tomato", "Cream and onion", "Chilli",
  "Honey", "Cinnamon", "Cardamom", "Hibiscus", "Tropical", "Mixed fruit", "Watermelon", "Guava", "Peach", "Berry", "Cola", "Lime", "Grape", "Cherry", "Kiwi", "Baobab", "Soursop", "Tangerine", "Pawpaw", "Beetroot"
]);

export const COVERAGE_OPEN_VALUES = Object.freeze([...list("brand", BRANDS), ...MATERIALS, ...COLOURS, ...FINISHES, ...FLAVOURS]);
