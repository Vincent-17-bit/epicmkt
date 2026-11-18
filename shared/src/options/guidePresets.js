// Ready-made size tables for every kind of shop, from the sizes sellers in Kenya actually sell by (body fit, dimensions, weight or
// volume packs, counts, capacity or rating, time or people). A template is { id, name, kind, unit, columns, rows? }:
//   rows   example rows, used when the item has no sizes of its own yet (or matched to its sizes by the first cell). They are only a
//          start: the table becomes the seller's own copy, and every cell, row and column can be changed.
// Figures are typical trade values (approximate): they vary by brand and country, so sellers check them against what they sell.
// Limits (the database's): 12 columns, 60 rows, 30 characters a header, 20 a cell.

export const EXTRA_GUIDE_KINDS = [
  { id: "jewellery", label: "Jewellery, watches and accessories", about: "Ring, chain, hat, belt and watch sizes, so buyers can check their own." },
  { id: "beauty", label: "Beauty, hair and personal care", about: "Volume, weight, shade or length for each size, so buyers compare value." },
  { id: "home", label: "Home, kitchen and bedding", about: "Bed, sheet, towel, curtain and cookware sizes in feet and centimetres." },
  { id: "household", label: "Household, cleaning and gas", about: "Pack weight, volume or count for each size, and how long it lasts." },
  { id: "health", label: "Pharmacy, health and optical", about: "Strength and pack count, or the body measurement each size fits." },
  { id: "farm", label: "Farm, agrovet and pets", about: "Bag weight, what it feeds or covers, and animal age or weight." },
  { id: "vehicle", label: "Vehicles, tyres and solar", about: "Tyre, battery, oil and solar sizes and what they fit." },
  { id: "electronics", label: "Electronics and appliances", about: "Storage, screen, capacity or power for each size." },
  { id: "paper", label: "Stationery, printing and books", about: "Paper sizes, weights, page counts and print sizes." },
  { id: "service", label: "Services, hire and rentals", about: "Time, people, rooms or load for each package, so buyers pick the right one." },
];

// The first column is always the size the buyer picks, called "Size" (the seller can rename it).
const t = (id, name, kind, unit, columns, rows) => ({ id, name, kind, unit, columns: ["Size", ...columns.slice(1)], ...(rows && { rows }) });

export const EXTRA_GUIDE_TEMPLATES = [
  // ---- clothing and body fit (Part 3: size systems) ----
  t("women-intl", "Women: US, UK, EU sizes", "clothing", "cm", ["Size", "US", "UK", "EU", "Bust", "Waist", "Hips"], [
    ["XS", "2", "6", "34", "80-83", "62-65", "87-90"], ["S", "4-6", "8-10", "36-38", "84-89", "66-71", "91-96"], ["M", "8-10", "12-14", "40-42", "90-95", "72-77", "97-102"],
    ["L", "12-14", "16-18", "44-46", "96-103", "78-85", "103-110"], ["XL", "16-18", "20-22", "48-50", "104-111", "86-93", "111-118"], ["XXL", "20-22", "24-26", "52-54", "112-119", "94-101", "119-126"],
  ]),
  t("men-tops", "Men's shirts and tops", "clothing", "cm", ["Size", "Chest", "Neck", "US/UK", "EU"], [
    ["S", "86-91", "36-37", "36", "46"], ["M", "96-101", "38-39", "40", "50"], ["L", "106-111", "40-41", "42-44", "52-54"],
    ["XL", "116-121", "42-43", "46", "56"], ["XXL", "126-131", "44-45", "48-50", "58-60"],
  ]),
  t("men-waist", "Men's trousers by waist", "clothing", "in", ["Size", "Waist (in)", "Waist (cm)", "EU"], [
    ["28", "28", "71", "44"], ["30", "30", "76", "46"], ["32", "32", "81", "48"], ["34", "34", "86", "50"], ["36", "36", "91", "52"],
    ["38", "38", "97", "54"], ["40", "40", "102", "56"], ["42", "42", "107", "58"], ["44", "44", "112", "60"],
  ]),
  t("kids-age", "Children by age", "clothing", "cm", ["Size", "Age", "Height", "Chest"], [
    ["0-3 months", "0-3 m", "56-62", "40-42"], ["3-6 months", "3-6 m", "62-68", "42-44"], ["6-12 months", "6-12 m", "68-80", "44-47"], ["12-24 months", "1-2 y", "80-92", "47-50"],
    ["3T", "3 y", "92-98", "52"], ["4T", "4 y", "98-104", "54"], ["5/6", "5-6 y", "104-116", "56-58"], ["7/8", "7-8 y", "116-128", "60-63"],
    ["9/10", "9-10 y", "128-140", "64-68"], ["11/12", "11-12 y", "140-152", "69-73"], ["13/14", "13-14 y", "152-164", "74-79"],
  ]),
  t("plus", "Plus size", "clothing", "cm", ["Size", "Numeric", "Bust", "Waist", "Hips"], [
    ["1X", "14-16", "106-112", "90-96", "114-120"], ["2X", "18-20", "117-122", "101-107", "125-130"], ["3X", "22-24", "127-132", "112-117", "135-140"], ["4X", "26-28", "137-142", "122-127", "145-150"],
  ]),
  t("bra", "Bras (band and cup)", "clothing", "cm", ["Size", "Under bust", "EU band", "Bust (B cup)"], [
    ["30", "63-67", "65", "78-80"], ["32", "68-72", "70", "83-85"], ["34", "73-77", "75", "88-90"], ["36", "78-82", "80", "93-95"],
    ["38", "83-87", "85", "98-100"], ["40", "88-92", "90", "103-105"], ["42", "93-97", "95", "108-110"], ["44", "98-102", "100", "113-115"],
  ]),
  t("kitenge", "Fabric and traditional wear", "clothing", null, ["Size", "Length", "Width", "Makes"], [
    ["Half piece", "3 yards", "45 in", "1 top or skirt"], ["Full piece", "6 yards", "45 in", "1 dress or set"], ["Leso pair", "2 pieces", "1 x 1.5 m", "Wrap or shawl"],
  ]),
  // ---- shoes (toddler) ----
  t("toddler-shoe", "Baby and toddler shoes", "shoe", "cm", ["EU", "UK", "US", "Foot length"], [
    ["17", "1", "2", "10.5"], ["18", "2", "3", "11"], ["19", "3", "4", "11.5"], ["20", "4", "5", "12.5"], ["21", "4.5", "5.5", "13"],
    ["22", "5", "6", "13.5"], ["23", "6", "7", "14"], ["24", "7", "8", "15"], ["25", "8", "9", "15.5"], ["26", "8.5", "9.5", "16"],
  ]),
  // ---- jewellery and accessories ----
  t("rings", "Rings", "jewellery", null, ["Size", "UK", "EU", "Circumference (mm)", "Diameter (mm)"], [
    ["US 5", "J 1/2", "49", "49.3", "15.7"], ["US 6", "L 1/2", "52", "51.9", "16.5"], ["US 7", "O", "54", "54.4", "17.3"], ["US 8", "Q", "57", "57.0", "18.1"],
    ["US 9", "S", "59", "59.5", "18.9"], ["US 10", "T 1/2", "62", "62.1", "19.8"], ["US 11", "V 1/2", "64", "64.6", "20.6"], ["US 12", "Y", "67", "67.2", "21.4"], ["US 13", "Z+1", "69", "69.7", "22.2"],
  ]),
  t("chains", "Necklaces and chains", "jewellery", "in", ["Length", "Inches", "Centimetres", "Sits at"], [
    ["16 in", "16", "41", "Choker"], ["18 in", "18", "46", "Collarbone"], ["20 in", "20", "51", "Below collarbone"], ["22 in", "22", "56", "Above the chest"], ["24 in", "24", "61", "Chest"],
  ]),
  t("hats", "Hats, caps and helmets", "jewellery", "cm", ["Size", "Head", "Hat size"], [
    ["XS", "53-54", "6 5/8"], ["S", "55-56", "6 7/8"], ["M", "57-58", "7 1/8"], ["L", "59-60", "7 3/8"], ["XL", "61-62", "7 5/8"], ["2XL", "63-64", "7 7/8"],
  ]),
  t("belts", "Belts", "jewellery", "in", ["Size", "Waist (in)", "Belt length (in)"], [["S", "28-30", "34"], ["M", "32-34", "38"], ["L", "36-38", "42"], ["XL", "40-42", "46"], ["XXL", "44-46", "50"]]),
  t("gloves", "Gloves", "jewellery", "cm", ["Size", "Hand girth", "Hand length"], [["S", "18-19", "17"], ["M", "20-21", "18"], ["L", "22-23", "19"], ["XL", "24-25", "20"]]),
  t("watches", "Watches", "jewellery", null, ["Size", "Case (mm)", "Strap width (mm)", "Fits wrist (cm)"], [["Small", "28-34", "14-16", "14-16"], ["Medium", "36-40", "18-20", "16-18"], ["Large", "42-46", "22-24", "18-21"]]),
  // ---- bags ----
  t("bag-sml", "Bags: small, medium, large", "bag", "cm", ["Size", "Width", "Height", "Depth", "Fits"], [
    ["Small", "20", "15", "6", "Phone, keys"], ["Medium", "30", "22", "10", "Tablet, wallet"], ["Large", "40", "30", "14", "Laptop, files"],
  ]),
  // ---- beauty ----
  t("cosmetic-ml", "Lotions, creams and oils", "beauty", null, ["Size", "Volume (ml)", "Lasts about"], [["Travel", "50", "2 weeks"], ["Regular", "250", "2 months"], ["Large", "400", "3 months"], ["Family", "1000", "6 months"]], ),
  t("perfume-ml", "Perfume sizes", "beauty", null, ["Size", "Volume (ml)", "Sprays about"], [["Rollerball", "10", "100"], ["Small", "30", "300"], ["Medium", "50", "500"], ["Large", "100", "1000"]]),
  t("hair-length", "Wigs, weaves and braids", "beauty", "in", ["Length", "Inches", "Falls to"], [
    ["8 in", "8", "Chin"], ["12 in", "12", "Shoulder"], ["16 in", "16", "Collarbone"], ["20 in", "20", "Mid-back"], ["24 in", "24", "Waist"], ["30 in", "30", "Hips"],
  ]),
  t("shades", "Shades (foundation, powder)", "beauty", null, ["Shade", "Tone", "Undertone"], [["Ivory", "Fair", "Neutral"], ["Honey", "Medium", "Warm"], ["Caramel", "Tan", "Warm"], ["Espresso", "Deep", "Neutral"]]),
  // ---- home, kitchen and bedding ----
  t("beds", "Beds and mattresses", "home", "cm", ["Size", "Feet", "Centimetres", "Sleeps"], [
    ["3x6", "3 x 6", "91 x 183", "1 child"], ["3.5x6", "3.5 x 6", "107 x 183", "1 adult"], ["4x6", "4 x 6", "122 x 183", "1-2"], ["5x6 (Queen)", "5 x 6", "152 x 183", "2"], ["6x6 (King)", "6 x 6", "183 x 183", "2+"],
  ]),
  t("mattress-thick", "Mattress thickness", "home", "in", ["Thickness", "Inches", "Feel"], [["4 in", "4", "Firm, for kids"], ["6 in", "6", "Medium"], ["8 in", "8", "Soft"], ["10 in", "10", "Extra soft"]]),
  t("sheets", "Bed sheets and duvets", "home", "cm", ["Size", "Fits bed", "Sheet size"], [["Single", "3.5 x 6", "180 x 260"], ["Double", "4 x 6", "200 x 260"], ["Queen", "5 x 6", "230 x 260"], ["King", "6 x 6", "260 x 260"]]),
  t("towels", "Towels", "home", "cm", ["Size", "Centimetres", "Weight (gsm)"], [["Face", "30 x 30", "400"], ["Hand", "40 x 70", "450"], ["Bath", "70 x 140", "500"], ["Bath sheet", "90 x 160", "600"]]),
  t("curtains", "Curtains", "home", "cm", ["Size", "Width", "Drop"], [["Small window", "140", "200"], ["Window", "200", "220"], ["Door", "250", "250"], ["Wide", "300", "270"]]),
  t("rugs", "Rugs and carpets", "home", "cm", ["Size", "Centimetres", "Fits"], [["Small", "120 x 170", "Bedside"], ["Medium", "160 x 230", "Sitting room"], ["Large", "200 x 290", "Lounge"], ["Extra large", "300 x 400", "Big room"]]),
  t("pots", "Cooking pots and sufurias", "home", "cm", ["Size", "Diameter", "Capacity (L)", "Cooks for"], [
    ["No. 16", "16", "1.5", "1-2"], ["No. 20", "20", "3", "3-4"], ["No. 24", "24", "5", "5-6"], ["No. 30", "30", "10", "10"], ["No. 40", "40", "25", "Events"],
  ]),
  t("tableware", "Plates, cups and cutlery sets", "home", null, ["Set", "Pieces", "Serves"], [["Set of 6", "6", "6"], ["Set of 12", "12", "12"], ["24 piece", "24", "6 (4 each)"], ["36 piece", "36", "6 (6 each)"]]),
  t("containers", "Buckets, basins, flasks", "home", null, ["Size", "Volume (L)", "Use"], [["Flask", "1", "Tea for 4"], ["Small", "5", "Kitchen"], ["Medium", "10", "Laundry"], ["Large", "20", "Water"]]),
  t("candles", "Candles and diffusers", "home", null, ["Size", "Weight (g)", "Burn time (h)"], [["Mini", "80", "15"], ["Medium", "200", "40"], ["Large", "400", "80"]]),
  // ---- food and drink (more) ----
  t("flour", "Flour, rice and sugar", "food", null, ["Size", "Weight (kg)", "Makes about"], [["1 kg", "1", ""], ["2 kg", "2", ""], ["5 kg", "5", ""], ["10 kg", "10", ""], ["25 kg", "25", ""], ["50 kg", "50", ""]]),
  t("eggs", "Eggs", "food", null, ["Pack", "Eggs"], [["Half dozen", "6"], ["Dozen", "12"], ["Tray", "30"]]),
  t("pizza", "Pizza", "food", "in", ["Size", "Diameter (in)", "Slices", "Serves"], [["Small", "8", "4", "1"], ["Medium", "12", "8", "2-3"], ["Large", "14", "8", "3-4"], ["Extra large", "16", "12", "4-5"]]),
  t("pastries", "Pastries and cupcakes", "food", null, ["Box", "Pieces", "Serves"], [["Box of 6", "6", "6"], ["Box of 12", "12", "12"], ["Box of 24", "24", "24"]]),
  t("cake-kg", "Cakes by weight", "food", "in", ["Size", "Weight (kg)", "Diameter (in)", "Serves"], [["Half kg", "0.5", "6", "6-8"], ["1 kg", "1", "8", "10-12"], ["2 kg", "2", "10", "20-25"], ["3 kg", "3", "12", "30-35"]]),
  t("portions", "Meals and portions", "food", null, ["Portion", "Serves", "Comes in"], [["Half", "1 small", "Bowl"], ["Full", "1", "Plate"], ["Family", "3-4", "Tray"]]),
  t("meat", "Meat, fish and produce", "food", null, ["Size", "Weight (kg)", "Pieces about"], [["Quarter kg", "0.25", ""], ["Half kg", "0.5", ""], ["1 kg", "1", ""], ["Whole", "", ""]]),
  t("oil", "Cooking oil", "drink", null, ["Size", "Volume (L)"], [["500 ml", "0.5"], ["1 L", "1"], ["3 L", "3"], ["5 L", "5"], ["10 L", "10"], ["20 L", "20"]]),
  t("water", "Water and refills", "drink", null, ["Size", "Volume (L)", "Type"], [["500 ml", "0.5", "Bottle"], ["1.5 L", "1.5", "Bottle"], ["5 L", "5", "Bottle"], ["18.9 L", "18.9", "Dispenser refill"], ["20 L", "20", "Dispenser refill"]]),
  t("alcohol", "Wine, spirits and beer", "drink", null, ["Size", "Volume (ml)", "Alcohol (%)"], [["Mzinga", "750", ""], ["Half (350 ml)", "350", ""], ["Quarter (250 ml)", "250", ""], ["Can", "500", ""], ["Crate of 24", "24 x 500", ""]]),
  // ---- household ----
  t("soap", "Soap and detergents", "household", null, ["Size", "Weight (g)", "Washes about"], [["Sachet", "50", "2"], ["Small", "500", "15"], ["1 kg", "1000", "30"], ["5 kg", "5000", "150"]]),
  t("liquids", "Liquid soap, bleach, cleaners", "household", null, ["Size", "Volume (ml)", "Lasts about"], [["Small", "500", "2 weeks"], ["1 L", "1000", "1 month"], ["5 L", "5000", "6 months"]]),
  t("diapers", "Diapers", "household", null, ["Size", "Baby weight (kg)", "Pieces"], [["0 (Newborn)", "Up to 4", ""], ["1", "2-5", ""], ["2", "3-6", ""], ["3", "4-9", ""], ["4", "7-18", ""], ["5", "11-25", ""], ["6", "15+", ""]]),
  t("pads", "Sanitary pads", "household", null, ["Type", "Length (mm)", "Pads in pack"], [["Regular", "240", "10"], ["Long", "280", "8"], ["Overnight", "320", "8"]]),
  t("tissue", "Tissue and toilet paper", "household", null, ["Pack", "Rolls", "Ply"], [["Single", "1", "2"], ["4 pack", "4", "2"], ["10 pack", "10", "2"]]),
  t("bags-litre", "Garbage bags", "household", null, ["Size", "Litres", "Bags in roll"], [["Small", "30", "30"], ["Medium", "50", "20"], ["Large", "100", "10"]]),
  t("lpg", "Cooking gas (LPG)", "household", null, ["Size", "Gas (kg)", "Lasts about"], [["3 kg", "3", "1-2 weeks"], ["6 kg", "6", "3-4 weeks"], ["13 kg", "13", "2 months"], ["22.5 kg", "22.5", "3 months"], ["50 kg", "50", "Hotels"]]),
  t("charcoal", "Charcoal and firewood", "household", null, ["Size", "Weight (kg)"], [["Tin", "2"], ["Small sack", "20"], ["Large sack", "90"], ["Bundle", ""]]),
  t("batteries", "Batteries", "household", null, ["Type", "Volts", "Used in"], [["AA", "1.5", "Remotes, toys"], ["AAA", "1.5", "Small remotes"], ["C", "1.5", "Torches"], ["D", "1.5", "Radios"], ["9V", "9", "Smoke alarms"], ["CR2032", "3", "Watches, keys"]]),
  // ---- health ----
  t("tablets", "Tablets and capsules", "health", null, ["Pack", "Strength", "Count"], [["Strip", "500 mg", "10"], ["Box", "500 mg", "100"], ["Bottle", "250 mg", "30"]]),
  t("syrups", "Syrups and drops", "health", null, ["Size", "Volume (ml)", "Doses about"], [["Drops", "15", ""], ["Small", "60", ""], ["Regular", "100", ""], ["Large", "200", ""]]),
  t("medical-sml", "Gloves, masks, braces", "health", "cm", ["Size", "Measure", "Box of"], [["S", "", "100"], ["M", "", "100"], ["L", "", "100"], ["XL", "", "50"]]),
  t("spectacles", "Spectacle frames", "health", null, ["Size", "Lens (mm)", "Bridge (mm)", "Arm (mm)"], [["Small", "48-50", "16-18", "135"], ["Medium", "51-53", "17-19", "140"], ["Large", "54-56", "18-20", "145"]]),
  t("compression", "Compression stockings", "health", "cm", ["Size", "Ankle", "Calf", "Pressure"], [["S", "19-21", "29-37", "15-20 mmHg"], ["M", "22-24", "33-41", "15-20 mmHg"], ["L", "25-27", "36-45", "20-30 mmHg"], ["XL", "28-30", "39-48", "20-30 mmHg"]]),
  // ---- farm and pets ----
  t("feed", "Animal feed", "farm", null, ["Size", "Weight (kg)", "Feeds about"], [["10 kg", "10", ""], ["25 kg", "25", ""], ["50 kg", "50", ""], ["70 kg", "70", ""]]),
  t("fertiliser", "Fertiliser and seed", "farm", null, ["Size", "Weight (kg)", "Covers about"], [["1 kg", "1", "Kitchen garden"], ["10 kg", "10", "1/4 acre"], ["25 kg", "25", "1/2 acre"], ["50 kg", "50", "1 acre"]]),
  t("chemicals", "Sprays and vet medicine", "farm", null, ["Size", "Volume (ml)", "Mix with water"], [["Small", "50", ""], ["Medium", "250", ""], ["1 L", "1000", ""], ["5 L", "5000", ""]]),
  t("birds", "Chicks and birds", "farm", null, ["Batch", "Birds", "Age"], [["1", "1", "Day old"], ["Batch of 50", "50", "Day old"], ["Batch of 100", "100", "Day old"], ["Point of lay", "1", "18-20 weeks"]]),
  t("pet-food", "Pet food", "farm", null, ["Size", "Weight (kg)", "Lasts (10 kg dog)"], [["1 kg", "1", "1 week"], ["3 kg", "3", "3 weeks"], ["7 kg", "7", "6 weeks"], ["15 kg", "15", "3 months"]]),
  t("pet-collar", "Pet collars and clothes", "farm", "cm", ["Size", "Neck", "Back length", "Fits"], [["XS", "20-26", "20", "Puppy, cat"], ["S", "26-32", "25", "Small dog"], ["M", "32-40", "35", "Medium dog"], ["L", "40-50", "45", "Large dog"], ["XL", "50-60", "55", "Giant dog"]]),
  // ---- vehicles and solar ----
  t("tyres", "Car tyres", "vehicle", null, ["Size", "Width (mm)", "Profile (%)", "Rim (in)", "Fits"], [
    ["175/70 R13", "175", "70", "13", ""], ["185/65 R14", "185", "65", "14", ""], ["195/65 R15", "195", "65", "15", ""], ["205/55 R16", "205", "55", "16", ""], ["265/65 R17", "265", "65", "17", ""],
  ]),
  t("moto-tyres", "Motorbike tyres", "vehicle", null, ["Size", "Width", "Rim (in)", "Fits"], [["2.75-18", "2.75 in", "18", "Front"], ["3.00-18", "3.00 in", "18", "Rear"], ["90/90-17", "90 mm", "17", ""]]),
  t("engine-oil", "Engine oil", "vehicle", null, ["Size", "Volume (L)", "Viscosity"], [["Half litre", "0.5", ""], ["1 L", "1", ""], ["4 L", "4", ""], ["5 L", "5", ""], ["20 L", "20", ""]]),
  t("car-battery", "Car batteries", "vehicle", null, ["Size", "Capacity (Ah)", "Volts", "Fits"], [["NS40", "35", "12", "Small cars"], ["NS60", "45", "12", "Saloon"], ["N50", "60", "12", "Saloon, SUV"], ["N70", "70", "12", "SUV, van"], ["N100", "100", "12", "Lorry"]]),
  t("helmets", "Helmets", "vehicle", "cm", ["Size", "Head"], [["XS", "53-54"], ["S", "55-56"], ["M", "57-58"], ["L", "59-60"], ["XL", "61-62"], ["2XL", "63-64"]]),
  t("solar-panel", "Solar panels", "vehicle", "cm", ["Size", "Power (W)", "Panel size", "Charges"], [["50 W", "50", "67 x 54", "Lights, phone"], ["100 W", "100", "100 x 67", "Lights, TV"], ["200 W", "200", "148 x 67", "TV, fridge"], ["400 W", "400", "172 x 113", "Home system"], ["550 W", "550", "228 x 113", "Home, business"]]),
  t("solar-battery", "Solar batteries and inverters", "vehicle", null, ["Size", "Capacity", "Volts", "Runs"], [["100 Ah", "1.2 kWh", "12", ""], ["200 Ah", "2.4 kWh", "12", ""], ["5 kWh", "5 kWh", "48", ""], ["10 kWh", "10 kWh", "48", ""]]),
  // ---- electronics and appliances ----
  t("storage", "Phones and tablets", "electronics", null, ["Size", "Storage", "RAM", "Photos about"], [["64 GB", "64 GB", "4 GB", "12,000"], ["128 GB", "128 GB", "6 GB", "25,000"], ["256 GB", "256 GB", "8 GB", "50,000"], ["512 GB", "512 GB", "12 GB", "100,000"]]),
  t("laptop", "Laptops and computers", "electronics", "in", ["Size", "Screen (in)", "RAM", "Storage"], [["Small", "13.3", "8 GB", "256 GB SSD"], ["Standard", "15.6", "16 GB", "512 GB SSD"], ["Large", "17.3", "32 GB", "1 TB SSD"]]),
  t("tv", "TVs and screens", "electronics", "in", ["Size", "Screen (in)", "Screen (cm)", "Sit at least"], [["24 in", "24", "61", "1 m"], ["32 in", "32", "81", "1.3 m"], ["43 in", "43", "109", "1.7 m"], ["50 in", "50", "127", "2 m"], ["55 in", "55", "140", "2.2 m"], ["65 in", "65", "165", "2.6 m"], ["75 in", "75", "190", "3 m"]]),
  t("fridge", "Fridges and freezers", "electronics", "cm", ["Size", "Capacity (L)", "Height", "Household"], [["Mini", "90", "85", "1"], ["Small", "150", "120", "1-2"], ["Medium", "250", "145", "3-4"], ["Large", "400", "175", "5+"], ["Side by side", "600", "178", "Large family"]]),
  t("washer", "Washing machines", "electronics", null, ["Size", "Load (kg)", "Household"], [["Small", "5-6", "1-2"], ["Medium", "7-8", "3-4"], ["Large", "9-12", "5+"]]),
  t("ac", "Air conditioners", "electronics", null, ["Size", "BTU", "Room (m²)"], [["9,000", "9000", "Up to 15"], ["12,000", "12000", "15-25"], ["18,000", "18000", "25-35"], ["24,000", "24000", "35-50"]]),
  t("power", "Power banks and generators", "electronics", null, ["Size", "Capacity", "Charges or runs"], [["10,000 mAh", "10000 mAh", "2 phone charges"], ["20,000 mAh", "20000 mAh", "4 phone charges"], ["2.5 kVA", "2.5 kVA", "Lights, TV, fridge"], ["5 kVA", "5 kVA", "Small shop"]]),
  t("memory", "Memory cards and flash drives", "electronics", null, ["Size", "Storage", "Photos about"], [["16 GB", "16 GB", "3,000"], ["32 GB", "32 GB", "6,000"], ["64 GB", "64 GB", "12,000"], ["128 GB", "128 GB", "25,000"], ["256 GB", "256 GB", "50,000"]]),
  t("cable-length", "Cables and extension leads", "electronics", null, ["Size", "Length (m)", "Sockets"], [["1 m", "1", ""], ["2 m", "2", "4 way"], ["3 m", "3", "4 way"], ["5 m", "5", "6 way"]]),
  t("speakers", "Speakers and soundbars", "electronics", "in", ["Size", "Length (in)", "Power (W)", "Room"], [["Compact", "24", "40", "Bedroom"], ["Standard", "31", "80", "Sitting room"], ["With subwoofer", "37", "120", "Large room"]]),
  // ---- building (more) ----
  t("cement-grade", "Cement bags and grades", "hardware", null, ["Size", "Weight (kg)", "Grade", "Use"], [["50 kg 32.5N", "50", "32.5N", "Plaster, blocks"], ["50 kg 42.5R", "50", "42.5R", "Slabs, columns"], ["50 kg 52.5N", "50", "52.5N", "Heavy works"], ["25 kg", "25", "32.5N", "Small jobs"]]),
  t("iron-sheets", "Iron sheets (mabati)", "dimensions", null, ["Size", "Gauge", "Thickness (mm)", "Profile"], [["Gauge 28", "28", "0.40", "Box profile"], ["Gauge 30", "30", "0.30", "Corrugated"], ["Gauge 32", "32", "0.25", "Corrugated"]]),
  t("rebar", "Steel bars (rebar)", "dimensions", null, ["Size", "Diameter (mm)", "Length (m)", "Weight (kg/m)"], [["Y8", "8", "12", "0.395"], ["Y10", "10", "12", "0.617"], ["Y12", "12", "12", "0.888"], ["Y16", "16", "12", "1.58"], ["Y20", "20", "12", "2.47"]]),
  t("pipes", "Pipes and fittings", "dimensions", null, ["Size", "Diameter (mm)", "Inches", "Length (m)"], [["1/2 in", "20", "1/2", "6"], ["3/4 in", "25", "3/4", "6"], ["1 in", "32", "1", "6"], ["2 in", "50", "2", "6"], ["4 in", "110", "4", "6"]]),
  t("tiles", "Tiles", "dimensions", "cm", ["Size", "Tile size", "Tiles per box", "m² per box"], [["30x30", "30 x 30", "11", "1.0"], ["40x40", "40 x 40", "9", "1.44"], ["60x60", "60 x 60", "4", "1.44"], ["60x120", "60 x 120", "2", "1.44"]]),
  t("boards", "Plywood, MDF and boards", "dimensions", null, ["Thickness", "Sheet (ft)", "Sheet (mm)"], [["3 mm", "8 x 4", "2440 x 1220"], ["6 mm", "8 x 4", "2440 x 1220"], ["9 mm", "8 x 4", "2440 x 1220"], ["12 mm", "8 x 4", "2440 x 1220"], ["18 mm", "8 x 4", "2440 x 1220"]]),
  t("blocks", "Blocks and bricks", "dimensions", "in", ["Size", "Wall width (in)", "Face (mm)", "Per m²"], [["4 in", "4", "450 x 225", "10"], ["6 in", "6", "450 x 225", "10"], ["9 in", "9", "450 x 225", "10"]]),
  t("aggregates", "Sand, ballast and hardcore", "hardware", null, ["Size", "Amount", "Truck"], [["Wheelbarrow", "0.05 t", ""], ["1 tonne", "1 t", "Pick-up"], ["3 tonne", "3 t", "Canter"], ["7 tonne", "7 t", "Lorry"], ["10 tonne", "10 t", "Tipper"]]),
  t("tanks", "Water tanks", "dimensions", "cm", ["Size", "Litres", "Height", "Diameter"], [["500 L", "500", "105", "95"], ["1,000 L", "1000", "130", "112"], ["2,000 L", "2000", "160", "145"], ["5,000 L", "5000", "200", "205"], ["10,000 L", "10000", "250", "260"]]),
  t("doors", "Doors and windows", "dimensions", null, ["Size", "Feet", "Centimetres"], [["Door 2x7", "2 x 7", "61 x 213"], ["Door 3x7", "3 x 7", "91 x 213"], ["Window 2x4", "2 x 4", "61 x 122"], ["Window 4x4", "4 x 4", "122 x 122"], ["Window 6x4", "6 x 4", "183 x 122"]]),
  t("glass", "Glass", "dimensions", null, ["Thickness", "Use"], [["3 mm", "Picture frames"], ["4 mm", "Small windows"], ["5 mm", "Windows"], ["6 mm", "Doors, shelves"], ["10 mm", "Shop fronts, tables"]]),
  t("bulbs", "Bulbs and lights", "hardware", null, ["Size", "Watts", "Like an old bulb of", "Cap"], [["Small", "5 W", "40 W", "E27 or B22"], ["Medium", "9 W", "60 W", "E27 or B22"], ["Bright", "12 W", "75 W", "E27 or B22"], ["Extra bright", "18 W", "100 W", "E27 or B22"]]),
  t("cable-core", "Electrical cable", "hardware", null, ["Size", "Core size", "Use", "Roll (m)"], [["1.5 mm²", "1.5", "Lights", "100"], ["2.5 mm²", "2.5", "Sockets", "100"], ["4 mm²", "4", "Cookers, showers", "100"], ["6 mm²", "6", "Main supply", "50"]]),
  // ---- paper and printing ----
  t("paper-iso", "Paper sizes (A series)", "paper", null, ["Size", "Millimetres", "Inches"], [["A0", "841 x 1189", "33.1 x 46.8"], ["A1", "594 x 841", "23.4 x 33.1"], ["A2", "420 x 594", "16.5 x 23.4"], ["A3", "297 x 420", "11.7 x 16.5"], ["A4", "210 x 297", "8.3 x 11.7"], ["A5", "148 x 210", "5.8 x 8.3"], ["A6", "105 x 148", "4.1 x 5.8"]]),
  t("paper-gsm", "Paper weight", "paper", null, ["Weight", "Feels like", "Use"], [["70 gsm", "Thin", "Notes"], ["80 gsm", "Office", "Printing"], ["120 gsm", "Thick", "Letterheads"], ["160 gsm", "Card", "Covers"], ["250 gsm", "Stiff card", "Cards, flyers"]]),
  t("books", "Exercise books", "paper", null, ["Pages", "Size"], [["32", "A5"], ["48", "A5"], ["96", "A5"], ["120", "A4"], ["200", "A4"]]),
  t("prints", "Photo prints", "paper", null, ["Size", "Inches", "Centimetres"], [["Passport (4)", "", "3.5 x 4.5"], ["4R", "4 x 6", "10 x 15"], ["5R", "5 x 7", "13 x 18"], ["6R", "6 x 8", "15 x 20"], ["A4", "8.3 x 11.7", "21 x 29.7"]]),
  t("banners", "Banners and posters", "paper", null, ["Size", "Feet", "Centimetres"], [["A3", "", "30 x 42"], ["A2", "", "42 x 59"], ["A1", "", "59 x 84"], ["Banner 2x3", "2 x 3", "61 x 91"], ["Banner 3x6", "3 x 6", "91 x 183"]]),
  t("cards-qty", "Business cards and flyers", "paper", null, ["Quantity", "Size", "Finish"], [["100", "90 x 55 mm", "Matt"], ["250", "90 x 55 mm", "Matt"], ["500", "90 x 55 mm", "Gloss"], ["1000", "90 x 55 mm", "Gloss"]]),
  // ---- services ----
  t("svc-time", "Sessions by time", "service", null, ["Session", "Minutes", "Includes"], [["Quick", "30", ""], ["Standard", "60", ""], ["Full", "90", ""]]),
  t("svc-braids", "Braids and styles", "service", "in", ["Size", "Length", "Time (hours)"], [["Small, shoulder", "12 in", "6-8"], ["Medium, mid-back", "20 in", "4-6"], ["Jumbo, waist", "26 in", "3-4"]]),
  t("svc-package", "Packages (Basic, Standard, Premium)", "service", null, ["Package", "Hours", "You get"], [["Basic", "2", ""], ["Standard", "4", ""], ["Premium", "8", ""]]),
  t("svc-guests", "Tents, chairs and venues by guests", "service", null, ["Size", "Guests", "Tent size (m)", "Chairs"], [["Small", "50", "10 x 10", "50"], ["Medium", "100", "15 x 10", "100"], ["Large", "200", "20 x 15", "200"], ["Extra large", "500", "30 x 20", "500"]]),
  t("svc-transport", "Transport and moving", "service", null, ["Vehicle", "Seats or load", "Good for"], [["Saloon", "4 seats", "Airport"], ["Van", "14 seats", "Group"], ["Bus", "33 seats", "Trips"], ["Pick-up", "1 tonne", "Small move"], ["Lorry", "7 tonnes", "2-3 bedroom"]]),
  t("svc-rooms", "Rooms and rentals", "service", "m", ["Room", "Beds", "Sleeps", "Size"], [["Single", "1", "1", ""], ["Double", "1 double", "2", ""], ["Twin", "2", "2", ""], ["Suite", "1 king", "2-3", ""]]),
  t("svc-laundry", "Laundry and cleaning", "service", null, ["Item", "Priced by", "Ready in"], [["Mixed clothes", "Per kg", "48 h"], ["Shirt", "Per piece", "24 h"], ["Suit", "Per piece", "48 h"], ["Duvet", "Per piece", "72 h"], ["House", "Per room", "Same day"]]),
  t("svc-plans", "Gym, classes and tuition plans", "service", null, ["Plan", "Duration", "Sessions"], [["Day pass", "1 day", "1"], ["Weekly", "1 week", "3"], ["Monthly", "1 month", "12"], ["Term", "3 months", "36"]]),
];

// Words that say which of the extra kinds an item is (read from its type name and its name).
export const EXTRA_GUIDE_WORDS = [
  ["jewellery", /\b(ring|rings|necklace|necklaces|chain|chains|pendant|bracelet|bracelets|anklet|earrings?|watch|watches|hat|hats|cap|caps|belt|belts|gloves?|jewell?ery)\b/i],
  ["beauty", /\b(lotion|lotions|cream|creams|serum|serums|shampoo|conditioner|wig|wigs|weave|weaves|braids?|lipstick|foundation|makeup|cosmetics?|skincare|hair)\b/i],
  ["home", /\b(sufuria|sufurias|pot|pots|pan|pans|plate|plates|cup|cups|cutlery|flask|flasks|bucket|buckets|basin|basins|towel|towels|duvet|duvets|bedsheets?|candle|candles|diffuser)\b/i],
  ["household", /\b(detergent|washing powder|bleach|tissue|toilet paper|diaper|diapers|pads|garbage bags?|gas|lpg|cylinder|charcoal|batteries|battery|soap)\b/i],
  ["health", /\b(tablet|tablets|capsule|capsules|syrup|syrups|vitamin|vitamins|supplement|supplements|syringe|syringes|masks?|spectacles?|glasses|contact lens|brace|braces|stockings?)\b/i],
  ["farm", /\b(feed|feeds|fertili[sz]er|seeds?|seedlings?|pesticides?|herbicides?|chicks?|layers mash|dairy meal|pet food|dog food|cat food|collar|collars|sprayer)\b/i],
  ["vehicle", /\b(tyre|tyres|tire|tires|engine oil|car battery|helmet|helmets|motorbike|solar|inverter|rims?)\b/i],
  ["electronics", /\b(phone|phones|smartphone|tablet pc|laptop|laptops|tv|tvs|television|fridge|fridges|freezer|washing machine|air conditioner|power bank|generator|memory card|flash drive|speaker|speakers|soundbar|woofer|subwoofer)\b/i],
  ["paper", /\b(paper|ream|exercise books?|notebooks?|print|printing|prints|banner|banners|poster|posters|business cards?|flyers?|lamination)\b/i],
  ["service", /\b(braiding|haircut|massage|manicure|pedicure|tailoring|laundry|dry cleaning|photography|videography|tent hire|chair hire|venue|transport|moving|hotel|room|rental|gym|tuition|classes|cleaning|fumigation)\b/i],
];
