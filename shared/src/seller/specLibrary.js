// The specifications a seller can add with one tap, by kind of item. Every kind of shop is covered: fashion, food, building, farm,
// electronics, vehicles, health, home, printing, and services. A row is { label, group, example, choice? }:
//   group    where the fact shows on the item page (Features & Specs, Measurements, Additional details, User guide, Item details)
//   example  shown greyed in the empty value box, so a beginner sees what to write
//   choice   buyers can choose between several of these (colours, sizes, weights, brands...). The editor offers to turn the row into an
//            option, where every choice gets its own price, stock and photo.
// Pure data and two lookups; no React, so the seller app, the mock and the tests share it.

const F = "Features & Specs";
const M = "Measurements";
const A = "Additional details";
const G = "User guide";
const D = "Item details";
const r = (label, group, example, choice = false) => ({ label, group, example, ...(choice && { choice: true }) });

// The rows almost any physical item can use. Shown after the kind's own rows.
const COMMON = [
  r("Brand", D, "Sunrise Bakery, Samsung, Bamburi", true),
  r("Model", D, "Galaxy A15, Model X200"),
  r("Material", F, "100% cotton, stainless steel, solid mahogany", true),
  r("Color", F, "Black, Grey, White", true),
  r("Size", M, "Small, Medium, Large", true),
  r("Dimensions (D x W x H)", M, "30 x 20 x 10 cm"),
  r("Weight", M, "500 g, 1 kg", true),
  r("Capacity", M, "1 L, 20 L, 64 GB", true),
  r("Pack size", M, "Pack of 6, 1 dozen, 500 ml", true),
  r("Special feature", F, "Waterproof, rechargeable, foldable"),
  r("Recommended uses", F, "Home, office, outdoor, school"),
  r("Mounting type", F, "Wall mount, tabletop, freestanding"),
  r("Country of origin", D, "Kenya, China, Italy"),
  r("Condition", D, "New, Ex-UK, Refurbished, Second hand"),
  r("Warranty", D, "1 year shop warranty"),
  r("What to do first", G, "Charge fully before first use"),
  r("Care instructions", G, "Hand wash cold, do not bleach"),
];

export const SPEC_KINDS = [
  { id: "bread", name: "Bread and bakery", match: /bread|loaf|bun|bakery|baker|baking|pastr*|croissant|doughnut|mandazi|chapati|scone|muffin|cookie|biscuit/i, rows: [
    r("Weight", M, "400 g, 600 g, 800 g", true), r("Brand", D, "Festive, Supa Loaf, Broadways", true), r("Type", F, "White, Brown, Wholemeal, Milk", true),
    r("Slices", M, "About 16 to 18 slices"), r("Sliced", F, "Pre-sliced"), r("Ingredients", A, "Wheat flour, water, sugar, yeast, salt, vegetable oil"),
    r("Allergens", A, "Contains wheat (gluten). May contain sesame or soy."), r("Dietary", A, "Vegetarian, dairy-free"),
    r("Shelf life", D, "4 to 5 days, or 3 months frozen"), r("Storage", G, "Keep sealed in a cool, dry place. Do not refrigerate."),
    r("Baked", D, "Fresh every morning"), r("Pack", M, "Single loaf, twin pack", true),
  ] },
  { id: "cake", name: "Cakes and celebrations", match: /cake|cupcake|birthday cake|wedding cake|celebration cake|tart|gateau|black forest|red velvet/i, rows: [
    r("Weight", M, "0.5 kg, 1 kg, 2 kg, 3 kg", true), r("Flavour", F, "Vanilla, Chocolate, Red velvet, Black forest", true),
    r("Diameter", M, "6 in, 8 in, 10 in, 12 in", true), r("Tiers", M, "1, 2, 3 tiers", true), r("Serves", M, "10 to 12 people"),
    r("Frosting", F, "Whipped cream, buttercream, fondant", true), r("Message on cake", F, "Free, up to 20 letters"), r("Order ahead", D, "48 hours before"),
    r("Ingredients", A, "Flour, eggs, butter, sugar, cocoa"), r("Allergens", A, "Eggs, milk, wheat, may contain nuts"), r("Storage", G, "Keep in the fridge, eat within 3 days"),
  ] },
  { id: "food", name: "Food and groceries", match: /flour|unga|rice|sugar|oil|milk|egg|tea|coffee|spice|maize|beans|grocery|cereal|pasta|noodle|snack|sweet|honey|jam|sauce|salt/i, rows: [
    r("Net weight", M, "1 kg, 2 kg, 5 kg", true), r("Volume", M, "500 ml, 1 L, 3 L", true), r("Brand", D, "Jogoo, Pembe, Mumias", true),
    r("Type", F, "Pishori, Basmati; Whole, Low fat", true), r("Pack size", M, "Single, carton of 12, bale of 24", true), r("Ingredients", A, "List them as on the pack"),
    r("Nutrition (per 100 g)", A, "Energy 350 kcal, protein 10 g, fat 1 g"), r("Allergens", A, "Contains gluten. Packed where nuts are handled."),
    r("Dietary", A, "Halal, vegan, gluten free, sugar free"), r("Best before", D, "6 months from packing"), r("Storage", G, "Store in a cool dry place, away from sunlight"),
    r("Preparation", G, "Boil 2 cups of water for every cup of rice"),
  ] },
  { id: "drinks", name: "Drinks and water", match: /water|soda|juice|drink|beer|wine|spirit|whisky|whiskey|vodka|gin|brandy|liquor|lager|tusker|guinness|alcohol|energy drink|yoghurt|yogurt|soft drink/i, rows: [
    r("Volume", M, "300 ml, 500 ml, 1 L, 2 L", true), r("Pack size", M, "Single, crate of 24, pack of 6", true), r("Flavour", F, "Orange, Mango, Original", true),
    r("Brand", D, "Keringet, Coca-Cola, Tusker", true), r("Alcohol (ABV)", A, "4.2%"), r("Container", F, "Glass bottle, PET bottle, can, carton", true),
    r("Refill or new", F, "Refill, with new bottle", true), r("Sugar", A, "No added sugar"), r("Serve", G, "Best served chilled"), r("Age limit", D, "18 years and over"),
  ] },
  { id: "fresh", name: "Fresh produce, meat and fish", match: /fruit|vegetable|tomato|onion|potato|banana|mango|avocado|meat|beef|goat|chicken|fish|tilapia|pork|sukuma|fresh/i, rows: [
    r("Sold by", M, "Per kg, per piece, per heap, per crate", true), r("Weight", M, "0.5 kg, 1 kg, 2 kg", true), r("Variety", F, "Hass, Fuerte; Kienyeji, Broiler", true),
    r("Cut", F, "Whole, steak, mince, ribs", true), r("Grade", F, "Grade 1, export quality", true), r("Source", D, "Kinangop farms, Lake Victoria"),
    r("Freshness", D, "Harvested daily"), r("Storage", G, "Keep refrigerated at 0 to 4 °C"),
  ] },
  { id: "clothing", name: "Clothing and fashion", match: /dress|shirt|top|blouse|t-shirt|tee|trouser|jean|skirt|short|suit|jacket|coat|hoodie|sweater|kitenge|ankara|kaftan|abaya|lingerie|bra|pyjama|swim|legging|uniform|cloth|wear|fashion|boutique/i, rows: [
    r("Size", M, "S, M, L, XL, XXL", true), r("Color", F, "Black, Olive, Navy", true), r("Material", F, "100% cotton, denim, chiffon, polyester", true),
    r("Fit", F, "Slim, regular, oversized", true), r("Length", M, "Mini, midi, maxi; 32 in inside leg", true), r("Sleeve", F, "Short, long, sleeveless"),
    r("Neckline", F, "Round, V-neck, collar"), r("Pattern", F, "Plain, striped, floral, kitenge print", true), r("Closure", F, "Zip, buttons, pull-on"),
    r("Pockets", F, "2 side pockets, 2 cargo pockets"), r("Occasion", F, "Casual, office, party, wedding"), r("Gender", D, "Women, Men, Unisex, Kids"),
    r("Model is wearing", M, "Size M, model is 170 cm"), r("Care instructions", G, "Machine wash cold, iron on low"),
  ] },
  { id: "shoes", name: "Shoes", match: /shoe|sneaker|heel|sandal|boot|loafer|slipper|footwear|trainer/i, rows: [
    r("Shoe size", M, "EU 38, 39, 40, 41, 42", true), r("Color", F, "Black, White, Tan", true), r("Upper material", F, "Leather, canvas, mesh", true),
    r("Sole", F, "Rubber, EVA"), r("Heel height", M, "5 cm"), r("Width", M, "Regular, wide", true), r("Closure", F, "Laces, slip-on, buckle, velcro"),
    r("Gender", D, "Women, Men, Unisex, Kids"), r("Occasion", F, "Running, office, casual, school"), r("Fit", G, "True to size; go one size up if between sizes"),
  ] },
  { id: "bags", name: "Bags, wallets and luggage", match: /bag|handbag|backpack|wallet|purse|clutch|tote|luggage|suitcase|briefcase/i, rows: [
    r("Color", F, "Black, Brown, Beige", true), r("Material", F, "Genuine leather, PU leather, canvas", true), r("Size", M, "Small, Medium, Large", true),
    r("Dimensions (D x W x H)", M, "12 x 30 x 25 cm"), r("Capacity", M, "20 L; fits a 15.6 in laptop"), r("Compartments", F, "3 inside pockets, 1 zip pocket"),
    r("Strap", F, "Adjustable, detachable shoulder strap"), r("Closure", F, "Zip, magnetic snap"),
  ] },
  { id: "jewellery", name: "Jewellery and watches", match: /jewel*|ring|necklace|chain|earring|bracelet|anklet|pendant|watch|bead/i, rows: [
    r("Metal", F, "Gold plated, sterling silver, stainless steel", true), r("Stone", F, "Cubic zirconia, pearl, none"), r("Ring size", M, "US 6, 7, 8, 9", true),
    r("Chain length", M, "16 in, 18 in, 20 in", true), r("Color", F, "Gold, Silver, Rose gold", true), r("Case size", M, "40 mm"), r("Strap", F, "Leather, metal, silicone", true),
    r("Water resistance", F, "30 m, splash proof"), r("Movement", F, "Quartz, automatic, smart"), r("Hypoallergenic", F, "Nickel free"), r("Gift box", D, "Included"),
  ] },
  { id: "beauty", name: "Beauty, hair and personal care", match: /lotion|cream|serum|soap|shampoo|conditioner|oil|makeup|lipstick|foundation|perfume|fragrance|deodorant|wig|weave|braid*|hair|nail|skincare|beauty|cosmetic/i, rows: [
    r("Volume", M, "50 ml, 100 ml, 250 ml", true), r("Net weight", M, "100 g, 250 g", true), r("Shade", F, "Ivory, Honey, Espresso", true),
    r("Scent", F, "Vanilla, unscented, oud", true), r("Skin type", F, "Dry, oily, combination, sensitive, all"), r("Hair type", F, "Natural, relaxed, curly"),
    r("Length", M, "12 in, 16 in, 20 in, 24 in", true), r("Key ingredients", A, "Shea butter, vitamin E, hyaluronic acid"), r("Free from", A, "Parabens, sulphates, alcohol"),
    r("How to use", G, "Apply to clean skin morning and night"), r("Warnings", G, "For external use only. Patch test first."), r("Expiry", D, "24 months from opening"),
  ] },
  { id: "home", name: "Home decor, candles and gifts", match: /decor*|pillow|cushion|blanket|throw|vase|mirror|frame|candle|diffuser|incense|gift|hamper|art|canvas|pottery|tray/i, rows: [
    r("Size", M, "Small, Medium, Large", true), r("Dimensions (D x W x H)", M, "45 x 45 cm"), r("Color", F, "Mustard, Teal, Cream", true), r("Material", F, "Velvet, ceramic, sisal", true),
    r("Set of", M, "1, 2, 4, 6", true), r("Scent", F, "Lavender, vanilla, sandalwood", true), r("Burn time", M, "About 40 hours"), r("Handmade", F, "Handmade in Kenya"),
    r("Gift wrapping", D, "Free gift wrapping on request"), r("Care", G, "Wipe with a dry cloth"),
  ] },
  { id: "building", name: "Building materials and hardware", match: /cement|sand|ballast|block|brick|iron sheet|mabati|rebar|steel|nail|screw|bolt|pipe|fitting|tile|timber|wood|plywood|mdf|board|glass|door|window|water tank|tank|paint|hardware|tool|lock|hinge|wheelbarrow|roofing/i, rows: [
    r("Size", M, "50 kg; 6 in; 2 x 4 in", true), r("Grade", F, "32.5N, 42.5R; Grade A", true), r("Gauge", M, "28, 30, 32", true), r("Length", M, "2 m, 3 m, 6 m, 12 ft", true),
    r("Diameter", M, "8 mm, 10 mm, 12 mm, 16 mm", true), r("Thickness", M, "3 mm, 6 mm, 9 mm, 18 mm", true), r("Volume", M, "1 L, 4 L, 20 L", true),
    r("Coverage", M, "About 10 m² per litre per coat; 1.44 m² per box"), r("Finish", F, "Matt, silk, gloss; box profile, corrugated", true),
    r("Color", F, "Brick red, Charcoal, White", true), r("Material", F, "Galvanised steel, PPR, PVC, hardwood", true), r("Brand", D, "Bamburi, Crown, Mabati Rolling Mills", true),
    r("Standard", D, "KEBS approved, KS EAS 18-1"), r("Delivery", D, "Delivered within Nairobi, priced per trip"), r("How to use", G, "Mix 1 bag of cement with 3 wheelbarrows of sand"),
  ] },
  { id: "electrical", name: "Electrical, lighting and solar", match: /cable|wire|socket|switch|bulb|light|lamp|led|solar|panel|inverter|battery|charge controller|generator|cctv|camera|extension/i, rows: [
    r("Power", M, "9 W, 100 W, 550 W", true), r("Voltage", M, "12 V, 24 V, 240 V", true), r("Capacity", M, "100 Ah, 200 Ah, 5 kWh", true), r("Length", M, "1 m, 5 m, 100 m roll", true),
    r("Cross-section", M, "1.5 mm², 2.5 mm², 4 mm²", true), r("Cap / fitting", F, "E27, B22", true), r("Color temperature", F, "Warm white, daylight", true),
    r("Ways", M, "4 way, 6 way", true), r("Resolution", F, "2 MP, 4 MP, 8 MP", true), r("Brand", D, "Philips, Jinko, Victron", true),
    r("Warranty", D, "2 years; panels 10 years"), r("Installation", G, "Installation available at extra cost"),
  ] },
  { id: "electronics", name: "Phones, computers and electronics", match: /phone|smartphone|ipad|iphone|samsung|galaxy|tecno|infinix|oppo|redmi|xiaomi|nokia|itel|laptop|macbook|lenovo|dell|computer|pc|tv|television|speaker|soundbar|woofer|headphone|earbud|radio|console|router|memory|flash|usb|power bank|charger|monitor|printer/i, rows: [
    r("Storage", M, "64 GB, 128 GB, 256 GB", true), r("RAM", M, "4 GB, 8 GB, 16 GB", true), r("Screen size", M, "6.5 in; 15.6 in; 43 in", true), r("Color", F, "Black, Grey, Silver", true),
    r("Processor", F, "Intel Core i5 12th gen; Snapdragon 680"), r("Battery", M, "5000 mAh; 8 hours"), r("Camera", F, "50 MP main, 8 MP selfie"), r("Network", F, "4G, 5G, dual SIM"),
    r("Operating system", F, "Android 14, Windows 11"), r("Connectivity", F, "Bluetooth 5.0, Wi-Fi, HDMI ARC, optical, AUX"), r("Output power", M, "80 W"),
    r("Ports", F, "2 x USB-C, HDMI"), r("Bundle", F, "Soundbar only, Soundbar + subwoofer", true), r("Condition", D, "New, Ex-UK, Refurbished", true),
    r("Warranty", D, "1 year manufacturer warranty"), r("In the box", D, "Handset, charger, cable, case"), r("Setup", G, "Pair by holding the Bluetooth button for 3 seconds"),
  ] },
  { id: "appliances", name: "Home appliances", match: /fridge|freezer|cooker|oven|microwave|blender|kettle|iron|washing machine|air condition|fan|heater|dispenser|toaster|fryer|vacuum/i, rows: [
    r("Capacity", M, "90 L, 250 L; 7 kg load", true), r("Power", M, "1500 W", true), r("Burners", M, "2, 4, 6 burner", true), r("Color", F, "Silver, Black, White", true),
    r("Energy rating", F, "A++"), r("Dimensions (D x W x H)", M, "60 x 55 x 145 cm"), r("Gas or electric", F, "Gas, electric, 4 gas + 2 electric", true),
    r("Brand", D, "Ramtons, Hotpoint, LG", true), r("Warranty", D, "2 years"), r("Installation", G, "Free delivery and installation in Nairobi"),
  ] },
  { id: "furniture", name: "Furniture, bedding and kitchenware", match: /sofa|chair|table|bed|mattress|wardrobe|shelf|desk|cabinet|curtain|sheet|duvet|towel|rug|carpet|pot|sufuria|pan|plate|cup|glass|cutlery|flask|jug|bucket|basin|furniture|kitchen/i, rows: [
    r("Size", M, "3x6, 4x6, 5x6, 6x6 ft; Queen, King", true), r("Seats", M, "1, 3, 5, 7 seater", true), r("Dimensions (D x W x H)", M, "90 x 200 x 75 cm"),
    r("Material", F, "Mahogany, mvule, metal, velvet", true), r("Color", F, "Grey, Brown, Cream", true), r("Thickness", M, "6 in, 8 in, 10 in", true), r("Density", F, "HD, high density foam"),
    r("Set of", M, "6, 12, 24 pieces", true), r("Diameter", M, "16 cm to 40 cm", true), r("Capacity", M, "1 L, 2 L, 20 L", true), r("Assembly", G, "Comes assembled; free delivery in town"),
    r("Care", G, "Wipe with a damp cloth"),
  ] },
  { id: "household", name: "Household and cleaning", match: /detergent|washing powder|bleach|disinfect|cleaner|tissue|toilet paper|diaper|pad|garbage|foil|cling|battery|matches|charcoal|gas|lpg|cylinder/i, rows: [
    r("Size", M, "500 g, 1 kg, 5 kg; 6 kg cylinder", true), r("Volume", M, "500 ml, 1 L, 5 L", true), r("Pack size", M, "4 rolls, 10 rolls, pack of 50", true),
    r("Scent", F, "Lemon, lavender, original", true), r("Type", F, "Refill, new cylinder with gas", true), r("Ply", F, "2 ply, 3 ply", true),
    r("Baby weight", M, "Size 3: 4 to 9 kg", true), r("Brand", D, "Omo, Jik, Rosy, K-Gas", true), r("How to use", G, "Use 1 capful in 5 L of water"), r("Safety", G, "Keep out of reach of children"),
  ] },
  { id: "health", name: "Pharmacy, health and optical", match: /tablet|capsule|syrup|medicine|drug|vitamin|supplement|pharma|bandage|glove|mask|syringe|brace|glasses|spectacle|lens|contact|test kit|thermometer/i, rows: [
    r("Strength", M, "250 mg, 500 mg", true), r("Pack size", M, "10 tablets, 30 capsules, 100 ml", true), r("Form", F, "Tablet, syrup, cream, drops", true),
    r("Active ingredient", A, "Paracetamol 500 mg"), r("Size", M, "S, M, L, XL", true), r("Lens power", M, "-2.00, +1.50", true), r("Frame size", M, "52-18-140 mm"),
    r("Prescription needed", D, "Yes / No"), r("Dosage", G, "Adults: 2 tablets every 6 hours. Follow your doctor's advice."), r("Warnings", G, "Do not exceed the stated dose"),
    r("Storage", G, "Below 25 °C, away from children"), r("Expiry", D, "Printed on the pack"),
  ] },
  { id: "farm", name: "Farm, agrovet and animals", match: /feed|fertili*|seed|seedling|pesticide|herbicide|vet|chick|chicken|layer|broiler|dairy|cow|goat|sheep|pig|sprayer|wire|mesh|hay|dap|can|npk|agro|farm/i, rows: [
    r("Bag size", M, "10 kg, 25 kg, 50 kg, 70 kg", true), r("Type", F, "Chick mash, grower, layers, dairy meal", true), r("Grade", F, "DAP, CAN, NPK 17:17:17", true),
    r("Variety", F, "H614, Kenya Mavuno; Kienyeji, Kuroiler", true), r("Age", M, "Day old, 4 weeks, point of lay", true), r("Volume", M, "100 ml, 1 L, 5 L", true),
    r("Sold by", M, "Per bird, per head, per kg liveweight", true), r("Brand", D, "Unga Farm Care, Simba, Kenya Seed", true), r("Application rate", G, "1 bag (50 kg) per acre at planting"),
    r("Withdrawal period", G, "Do not slaughter within 7 days of treatment"), r("Storage", G, "Keep dry, off the floor"),
  ] },
  { id: "pets", name: "Pets", match: /pet|dog|cat|puppy|kitten|aquarium|bird cage|collar|leash/i, rows: [
    r("Bag size", M, "1 kg, 3 kg, 7 kg, 15 kg", true), r("Life stage", F, "Puppy, adult, senior", true), r("Flavour", F, "Chicken, beef, fish", true),
    r("Size", M, "XS, S, M, L, XL", true), r("Neck size", M, "20 to 30 cm", true), r("Breed size", F, "Small, medium, large breeds"), r("Feeding guide", G, "Feed 2 cups a day for a 10 kg dog"),
  ] },
  { id: "vehicles", name: "Vehicles, motorbikes and spares", match: /tyre|tire|rim|engine oil|lubricant|car battery|wiper|helmet|motorbike|boda|spare|brake|filter|bulb|car|vehicle|auto/i, rows: [
    r("Tyre size", M, "195/65 R15, 205/55 R16", true), r("Fits", F, "Toyota Probox 2008-2020, Boxer 150", true), r("Viscosity", F, "5W-30, 10W-40, 20W-50", true),
    r("Volume", M, "1 L, 4 L, 5 L", true), r("Battery", M, "12 V 45 Ah, 70 Ah", true), r("Size", M, "S, M, L, XL; 14 in to 28 in", true), r("Engine", M, "125 cc, 150 cc", true),
    r("Brand", D, "Bridgestone, Total, Chloride Exide", true), r("Condition", D, "New, Ex-Japan, used", true), r("Warranty", D, "12 months or 20,000 km"), r("Fitting", G, "Free fitting and balancing"),
  ] },
  { id: "printing", name: "Stationery, books and printing", match: /paper|ream|book|exercise|pen|marker|envelope|print|banner|poster|business card|sticker|flyer|calendar|diary|notebook|textbook|novel|stationery|lamination/i, rows: [
    r("Paper size", M, "A4, A5, A3; 4x6 in", true), r("Paper weight", M, "80 gsm, 120 gsm, 300 gsm", true), r("Quantity", M, "100, 250, 500, 1000 pieces", true),
    r("Pages", M, "48, 96, 200 pages", true), r("Finish", F, "Matt, gloss, laminated", true), r("Print sides", F, "One side, both sides", true), r("Color", F, "Full colour, black and white", true),
    r("Author", D, "Ngũgĩ wa Thiong'o"), r("Publisher", D, "East African Educational Publishers"), r("Edition", D, "2nd edition, 2024"), r("Level", D, "Grade 6, Form 3, University", true),
    r("Language", D, "English, Kiswahili", true), r("Turnaround", D, "Ready in 24 hours"), r("Artwork", G, "Send your design as PDF; design help is extra"),
  ] },
  { id: "service-beauty", name: "Hair, beauty and wellness services", match: /haircut|barber|salon|braids|cornrow|locs|dreadlock|manicure|pedicure|nails|massage|spa|facial|makeup service|lash|brows|waxing|wellness/i, rows: [
    r("Duration", M, "30, 60, 90 minutes", true), r("Length", M, "Shoulder, mid-back, waist", true), r("Size", M, "Small, medium, jumbo", true), r("Who it is for", F, "Women, men, kids"),
    r("Includes", F, "Wash, blow dry, styling"), r("Hair provided", F, "Yes, or bring your own", true), r("Booking", D, "By appointment; walk-ins welcome"),
    r("Before you come", G, "Come with washed, detangled hair"), r("Aftercare", G, "Wrap at night; moisturise twice a week"),
  ] },
  { id: "service-trade", name: "Repairs, tailoring, laundry and cleaning", match: /repair|fix|tailor|alteration|laundry|dry clean|cleaning|fumigation|plumb*|electrician|mechanic|install|maintenance|carpentry|welding/i, rows: [
    r("Priced by", M, "Per item, per kg, per room, per hour", true), r("Turnaround", M, "Same day, 48 hours", true), r("Area served", D, "Nairobi CBD, Westlands, Kilimani"),
    r("Includes", F, "Labour; parts priced separately"), r("Call-out fee", D, "KES 500, waived if you go ahead"), r("Guarantee", D, "30 days on workmanship"),
    r("What to prepare", G, "Clear the room before we arrive"), r("Booking", D, "Book 1 day ahead"),
  ] },
  { id: "service-events", name: "Events, photography and hire", match: /event|wedding|photograph|video|dj|mc|tent|chair hire|decor hire|catering|venue|hall|sound hire|cake stand/i, rows: [
    r("Guests", M, "50, 100, 200, 500 guests", true), r("Hours", M, "2, 4, 8 hours", true), r("Package", F, "Basic, Standard, Premium", true), r("Deliverables", F, "300 edited photos, 1 highlight video"),
    r("Includes", F, "Setup and take down within Nairobi"), r("Deposit", D, "50% to book the date"), r("Travel", D, "Outside Nairobi: transport and lodging extra"), r("Delivery time", D, "Photos in 14 days"),
  ] },
  { id: "service-travel", name: "Transport, travel and lodging", match: /transport|taxi|cab|matatu|bus|shuttle|truck|lorry|moving|delivery|courier|parcel|hotel|lodge|airbnb|room|stay|tour|safari|travel|flight|ticket|car hire/i, rows: [
    r("Seats / load", M, "5 seater, 14 seater; 3 tonne", true), r("Room type", F, "Single, double, twin, suite", true), r("Duration", M, "Per night, per day, half day", true),
    r("Route", D, "Nairobi to Mombasa"), r("Includes", F, "Breakfast, driver, fuel, park fees"), r("Check-in / pick-up", D, "From 2 pm; pick-up at your door"),
    r("Cancellation", D, "Free up to 48 hours before"), r("What to bring", G, "ID or passport"),
  ] },
  { id: "service-learning", name: "Classes, tuition and fitness", match: /class|lesson|tuition|tutor|course|training|coaching|gym|fitness|yoga|dance|swim|driving school|music lesson/i, rows: [
    r("Duration", M, "1 hour, per term, monthly", true), r("Level", F, "Beginner, intermediate, advanced; Grade 4", true), r("Mode", F, "In person, online, home visit", true),
    r("Schedule", D, "Mon, Wed, Fri, 6 pm"), r("Class size", M, "Up to 10 people"), r("Includes", F, "Learning materials, certificate"), r("What to bring", G, "Gym shoes and a towel"),
  ] },
  { id: "service", name: "Any other service", match: /service|consult|design|marketing|legal|account|it support|web|software|agency/i, rows: [
    r("Priced by", M, "Per hour, per job, per month", true), r("Package", F, "Basic, Standard, Premium", true), r("Duration", M, "1 hour, 1 week", true), r("Includes", F, "What the price covers"),
    r("Turnaround", D, "Delivered in 3 working days"), r("Revisions", D, "2 rounds of changes"), r("Area served", D, "Nairobi, or online anywhere"), r("Booking", D, "Pay 50% to start"),
  ] },
];

// Each word in a pattern matches a whole word, plural included ("tyre" finds "Tyres", "table" does not find "tablets"). A word of six
// letters or more, or one written with a trailing *, also matches longer words that start with it ("photograph" finds "photography").
const EXACT = new Set(["tablet", "tablets", "table", "short", "suit", "water", "energy", "sweet", "watch", "chain", "frame", "block", "board", "panel", "switch", "camera", "cable", "light", "fruit", "fresh", "class", "event", "video", "venue", "glass", "spirit", "steel", "drink", "candle", "course", "socket", "jacket", "service"]);
const wordsOf = (re) => re.source.split("|").map((t) => {
  if (/[\\()?]/.test(t)) return t;
  if (/\s/.test(t)) return `${t}(?:s|es)?`;
  if (t.endsWith("*")) return `${t.slice(0, -1)}\\w*`;
  return t.length >= 6 && !EXACT.has(t) ? `${t}\\w*` : `${t}(?:s|es)?`;
});
for (const kind of SPEC_KINDS) kind.match = new RegExp(`\\b(?:${wordsOf(kind.match).join("|")})\\b`, "i");

const COMMON_KIND = { id: "general", name: "Any item", rows: COMMON };

/** Every kind, the general one last. */
export const specKinds = () => [...SPEC_KINDS, COMMON_KIND];

/** The kind that fits best: the item's type name first, then its name and section, then the shop's category. null when none fits. */
// The longest matching words win ("Water tank" is building, not drinks), then the order of SPEC_KINDS.
const bestKind = (text) => {
  let best = null;
  let score = 0;
  for (const kind of SPEC_KINDS) {
    const all = String(text ?? "").match(new RegExp(kind.match.source, "gi")) ?? [];
    const top = Math.max(0, ...all.map((m) => m.length));
    if (top > score) { best = kind; score = top; }
  }
  return best;
};
export function suggestSpecKind({ typeName = "", name = "", section = "", category = "" } = {}) {
  for (const text of [typeName, `${name} ${section}`, category]) {
    const hit = bestKind(text);
    if (hit) return hit;
  }
  return null;
}

/** The quick-add rows for an item: its kind's rows, then the common ones it does not repeat (by label). */
export function specSuggestions(context = {}) {
  const kind = suggestSpecKind(context);
  const seen = new Set();
  const out = [];
  for (const row of [...(kind?.rows ?? []), ...COMMON]) {
    const key = row.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { kind: kind ?? COMMON_KIND, rows: out };
}

/** The example for a spec label, from any kind ("" when none). */
export function specExample(label) {
  const key = String(label ?? "").trim().toLowerCase();
  if (!key) return "";
  for (const kind of specKinds()) {
    const hit = kind.rows.find((x) => x.label.toLowerCase() === key);
    if (hit) return hit.example;
  }
  return "";
}

// Labels buyers usually choose between (an option, each with its own price and photo), whatever kind they came from.
const CHOICE_WORDS = /^(colou?r|size|shoe size|weight|net weight|capacity|volume|brand|material|flavou?r|scent|shade|storage|ram|length|pack( size)?|set of|style|type|variety|grade|gauge|diameter|thickness|bag size|seats|room type|package|tiers|metal|strap|bundle|finish|paper size|quantity|duration|level|mode|priced by|sold by|guests|hours|cut|container|tyre size|viscosity|power|voltage|screen size|burners|ways|fit|pattern|width|ring size|chain length|life stage|age|form|strength|lens power|frame size)$/i;

/** Whether a spec row is something buyers choose between, so it can become an option. */
export const isChoiceSpec = (label) => CHOICE_WORDS.test(String(label ?? "").trim()) || specKinds().some((k) => k.rows.some((x) => x.choice && x.label.toLowerCase() === String(label ?? "").trim().toLowerCase()));

/** The separate choices written in one spec value: "Black, Grey / White" -> ["Black", "Grey", "White"]. Duplicates are dropped. */
export function choicesIn(value) {
  const out = [];
  for (const part of String(value ?? "").split(/\s*(?:,|;|\n|\s\/\s|\bor\b)\s*/i)) {
    const t = part.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}
