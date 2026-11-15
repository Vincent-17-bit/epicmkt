// Demo items for everyday things the first demo shops did not sell yet, so product search shows its filters for them: soda,
// salt and sugar, chocolates, beds and mattresses, tables, carpets, flowers, microwaves, shirts, bulbs, timber, pens and
// whiteboards, monitors and flash disks, plates of pilau and a menu, and massages. Keyed by the demo shop's slug; the shop's
// own photos and ids are added by businesses.js. Each item carries the spec rows a seller would fill in, which is what the
// filters read. Only the demo backend uses this file.

const spec = (pairs) => pairs.map(([label, value]) => ({ label, value }));
const item = (name, priceKes, section, description, specs, extra = {}) => ({ name, priceKes, section, description, specs: spec(specs), ...extra });
const good = (name, priceKes, section, description, specs, extra = {}) => item(name, priceKes, section, description, specs, { kind: "product", ...extra });

export const EVERYDAY_ITEMS = {
  // Supermarket: soda, salt, sugar, cooking oil, chocolates, juice, tea
  "jirani-mini-supermarket": [
    good("Coca-Cola 500ml bottle", 80, "Soda and drinks", "Ice-cold Coca-Cola in a 500 ml plastic bottle.", [["Brand", "Coca-Cola"], ["Size", "500 ml"], ["Pack", "Single bottle"], ["Type", "Soda"]], { brand: "Coca-Cola" }),
    good("Fanta Orange 2L", 220, "Soda and drinks", "Fanta Orange for the family table, 2 litre bottle.", [["Brand", "Fanta"], ["Size", "2 litres"], ["Pack", "Single bottle"], ["Flavour", "Orange"]], { brand: "Fanta" }),
    good("Sprite 1.25L", 150, "Soda and drinks", "Lemon-lime Sprite, 1.25 litre bottle.", [["Brand", "Sprite"], ["Size", "1.25 L"], ["Pack", "Single bottle"]], { brand: "Sprite" }),
    good("Coca-Cola Zero 330ml can, 6-pack", 540, "Soda and drinks", "No sugar Coca-Cola, six 330 ml cans.", [["Brand", "Coca-Cola"], ["Size", "330 ml"], ["Pack", "6-pack"], ["Sugar", "Sugar free"]], { brand: "Coca-Cola" }),
    good("Soda crate 24 x 300ml glass bottles", 1150, "Soda and drinks", "A crate of 24 mixed sodas in returnable glass bottles. Crate deposit extra.", [["Size", "300 ml"], ["Pack", "Crate of 24"], ["Type", "Soda"]]),
    good("Afia mango juice 1L", 190, "Soda and drinks", "Mango juice drink, 1 litre.", [["Brand", "Afia"], ["Size", "1 litre"], ["Type", "Juice"]], { brand: "Afia" }),
    good("Kensalt iodated table salt 1kg", 45, "Salt and sugar", "Fine iodated table salt for everyday cooking.", [["Brand", "Kensalt"], ["Weight", "1 kg"], ["Type", "Salt"]], { brand: "Kensalt" }),
    good("Kensalt iodated table salt 500g", 25, "Salt and sugar", "Fine iodated table salt, 500 g packet.", [["Brand", "Kensalt"], ["Weight", "500 g"], ["Type", "Salt"]], { brand: "Kensalt" }),
    good("Mumias brown sugar 2kg", 330, "Salt and sugar", "Kenyan brown sugar, 2 kg packet.", [["Brand", "Mumias"], ["Weight", "2 kg"], ["Type", "Sugar"]], { brand: "Mumias" }),
    good("Kabras white sugar 1kg", 175, "Salt and sugar", "Refined white sugar, 1 kg packet.", [["Brand", "Kabras"], ["Weight", "1 kg"], ["Type", "Sugar"]], { brand: "Kabras" }),
    good("Fresh Fri cooking oil 3L", 1050, "Cooking oil", "Vegetable cooking oil, 3 litre jerrican.", [["Brand", "Fresh Fri"], ["Size", "3 litres"], ["Type", "Cooking oil"]], { brand: "Fresh Fri" }),
    good("Pishori rice 2kg", 420, "Rice and flour", "Aromatic Mwea pishori rice.", [["Weight", "2 kg"], ["Type", "Rice"], ["Origin", "Mwea"]]),
    good("Ketepa Pride tea leaves 250g", 150, "Tea and coffee", "Strong Kenyan black tea leaves.", [["Brand", "Ketepa"], ["Weight", "250 g"], ["Type", "Tea leaves"]], { brand: "Ketepa" }),
    good("Cadbury Dairy Milk chocolate bar 80g", 230, "Chocolates and sweets", "Milk chocolate bar.", [["Brand", "Cadbury"], ["Weight", "80 g"], ["Type", "Chocolate bar"]], { brand: "Cadbury" }),
    good("Ferrero Rocher 16 pieces gift box", 1450, "Chocolates and sweets", "Hazelnut chocolates in a gift box, 16 pieces (200 g).", [["Brand", "Ferrero"], ["Weight", "200 g"], ["Pieces", "16"], ["Packaging", "Gift box"]], { brand: "Ferrero" }),
    good("Toblerone milk chocolate 100g", 380, "Chocolates and sweets", "Swiss milk chocolate with honey and almond nougat.", [["Brand", "Toblerone"], ["Weight", "100 g"], ["Type", "Chocolate bar"]], { brand: "Toblerone" }),
    good("Assorted sweets jar 500g", 450, "Chocolates and sweets", "Toffees and fruit sweets for parties, 500 g jar.", [["Weight", "500 g"], ["Type", "Sweets and toffees"]])
  ],
  // Home store: beds, mattresses, tables, carpets, flowers, microwaves
  "nyumbani-home-store": [
    good("Mahogany bed 5x6 with storage drawers", 38500, "Beds and mattresses", "Solid mahogany double bed with two storage drawers and a padded headboard.", [["Bed size", "5 x 6 ft (double)"], ["Material", "Mahogany wood"], ["Storage", "Two drawers"], ["Assembly", "Free delivery and assembly in town"]]),
    good("Metal bed 4x6", 14500, "Beds and mattresses", "Strong powder-coated metal bed frame, three-quarter size.", [["Bed size", "4 x 6 ft"], ["Material", "Metal (steel)"], ["Colour", "Black"]]),
    good("Bunk bed 3x6 double-decker", 26000, "Beds and mattresses", "Wooden double-decker for kids' rooms and hostels, with ladder and guard rail.", [["Bed size", "3 x 6 ft"], ["Material", "Cypress wood"], ["Type", "Bunk bed"]]),
    good("High density foam mattress 5x6 8 inch", 9800, "Beds and mattresses", "Firm high density foam mattress with quilted cover.", [["Bed size", "5 x 6 ft"], ["Thickness", "8 inch"], ["Type", "High density foam"]]),
    good("Orthopaedic spring mattress 6x6 10 inch", 32000, "Beds and mattresses", "Pocket spring orthopaedic mattress for back support.", [["Bed size", "6 x 6 ft (king)"], ["Thickness", "10 inch"], ["Type", "Orthopaedic spring"]]),
    good("Foam mattress 4x6 6 inch", 5200, "Beds and mattresses", "Everyday foam mattress, three-quarter size.", [["Bed size", "4 x 6 ft"], ["Thickness", "6 inch"], ["Type", "Foam"]]),
    good("6 seater dining table with chairs", 42000, "Tables", "Rectangular mahogany dining table with six cushioned chairs.", [["Table", "Dining"], ["Seats", "6"], ["Shape", "Rectangular"], ["Material", "Mahogany wood"]]),
    good("Glass coffee table", 8900, "Tables", "Round tempered glass coffee table with a steel base.", [["Table", "Coffee table"], ["Shape", "Round"], ["Material", "Glass and steel"]]),
    good("Study desk with drawer", 6500, "Tables", "Compact study and office desk with one drawer.", [["Table", "Study / office desk"], ["Shape", "Rectangular"], ["Material", "MDF board"], ["Size", "100 x 50 cm"]]),
    good("Shaggy carpet 5x7 ft", 6800, "Carpets and rugs", "Soft fluffy shaggy carpet for the living room.", [["Size", "5 x 7 ft (160 x 230 cm)"], ["Type", "Shaggy carpet"], ["Shape", "Rectangular"], ["Colour", "Grey"]]),
    good("Round fluffy rug 160cm", 3900, "Carpets and rugs", "Round fluffy rug for bedrooms.", [["Size", "160 cm round"], ["Type", "Rug"], ["Shape", "Round"], ["Colour", "White"]]),
    good("Wall to wall carpet per square metre", 950, "Carpets and rugs", "Hard-wearing wall to wall carpet, fitted by our team.", [["Type", "Wall to wall carpet"], ["Sold by", "Per square metre"], ["Colour", "Brown"]]),
    good("Rubber doormat", 650, "Carpets and rugs", "Non-slip rubber doormat.", [["Type", "Doormat"], ["Size", "40 x 60 cm"], ["Colour", "Black"]]),
    good("Red roses bouquet 12 stems", 2500, "Flowers and gifts", "A dozen fresh red roses, wrapped, with a card. Order by 2pm for same-day delivery in town.", [["Flowers", "Roses"], ["Stems", "12"], ["Arrangement", "Bouquet"], ["Occasion", "Love and anniversary"]]),
    good("Birthday flowers in a vase", 3800, "Flowers and gifts", "Mixed seasonal flowers in a glass vase, with a birthday card.", [["Flowers", "Mixed"], ["Arrangement", "In a vase"], ["Occasion", "Birthday"]]),
    good("Sympathy wreath", 4500, "Flowers and gifts", "White lilies and chrysanthemums on a round wreath.", [["Flowers", "Lilies and chrysanthemums"], ["Arrangement", "Wreath"], ["Occasion", "Sympathy and funeral"]]),
    good("Ramtons 20L solo microwave", 9500, "Appliances", "Simple 20 litre microwave with mechanical dials.", [["Brand", "Ramtons"], ["Capacity", "20 L"], ["Power", "700 W"], ["Type", "Solo"]], { brand: "Ramtons" }),
    good("Samsung 23L microwave with grill", 15500, "Appliances", "23 litre microwave with grill and digital controls.", [["Brand", "Samsung"], ["Capacity", "23 L"], ["Power", "800 W"], ["Features", "Grill, digital controls, auto defrost"]], { brand: "Samsung" })
  ],
  // Hardware: timber, cement, roofing, paint, bulbs, cable, tank
  "mwanzo-hardware": [
    good("Cypress timber 2x2 12ft", 280, "Timber", "Treated cypress 2x2, 12 ft long, for roofing and frames.", [["Wood", "Cypress"], ["Size", "2 x 2 inch"], ["Length", "12 ft"], ["Treatment", "Treated"]]),
    good("Cypress timber 4x2 14ft", 620, "Timber", "Treated cypress 4x2 (2x4), 14 ft, rafters and studs.", [["Wood", "Cypress"], ["Size", "4 x 2 inch"], ["Length", "14 ft"], ["Treatment", "Treated"]]),
    good("Mvule board 6x1 10ft", 1350, "Timber", "Planed mvule hardwood board for furniture and doors.", [["Wood", "Mvule"], ["Size", "6 x 1 inch"], ["Length", "10 ft"], ["Finish", "Planed"]]),
    good("Plywood 8x4 18mm", 3900, "Timber", "Marine plywood sheet, 8 x 4 ft, 18 mm.", [["Wood", "Plywood"], ["Size", "8 x 4 ft sheet"], ["Thickness", "18 mm"]]),
    good("Blue gum pole 16ft", 950, "Timber", "Eucalyptus pole for scaffolding and fencing.", [["Wood", "Eucalyptus (blue gum)"], ["Size", "Pole"], ["Length", "16 ft"], ["Treatment", "Untreated"]]),
    good("Bamburi cement 50kg", 780, "Cement and roofing", "Bamburi Nguvu cement, 50 kg bag.", [["Brand", "Bamburi"], ["Weight", "50 kg"], ["Type", "Cement"]], { brand: "Bamburi" }),
    good("Iron sheet gauge 30 box profile 3m", 1150, "Cement and roofing", "Pre-painted box profile mabati, gauge 30, 3 metres.", [["Type", "Box profile iron sheet"], ["Gauge", "30"], ["Length", "3 m"], ["Colour", "Maroon"]]),
    good("Crown silk vinyl emulsion 4L", 2900, "Paint", "Washable wall emulsion, 4 litres.", [["Brand", "Crown"], ["Paint", "Emulsion"], ["Size", "4 L"], ["Colour", "White"]], { brand: "Crown" }),
    good("Philips LED bulb 9W E27 warm white", 280, "Bulbs and lighting", "Energy saving LED bulb, screw base.", [["Brand", "Philips"], ["Power", "9 W"], ["Base", "E27"], ["Light colour", "Warm white"]], { brand: "Philips" }),
    good("LED bulb 15W B22 daylight", 320, "Bulbs and lighting", "Bright daylight LED bulb, pin base.", [["Power", "15 W"], ["Base", "B22"], ["Light colour", "Daylight 6500K"]]),
    good("LED floodlight 50W", 1900, "Bulbs and lighting", "Outdoor security floodlight, waterproof.", [["Power", "50 W"], ["Type", "Floodlight"], ["Water resistance", "IP65"], ["Light colour", "Cool white"]]),
    good("Solar security light with sensor", 2400, "Bulbs and lighting", "Solar powered security light with motion sensor.", [["Type", "Security light"], ["Power source", "Solar"], ["Power", "30 W"]]),
    good("2.5mm twin and earth cable 100m", 9800, "Electrical", "Copper twin and earth cable for sockets, 100 m roll.", [["Item", "Electrical cable"], ["Size", "2.5 mm"], ["Length", "100 m"]]),
    good("1000L water tank", 11500, "Plumbing", "UV-protected plastic water tank, 1000 litres.", [["Item", "Water tank"], ["Capacity", "1000 L"], ["Colour", "Black"]])
  ],
  // Cyber and stationery point: pens, books, paper, whiteboards, more print services
  "maseno-mobile-money-point": [
    good("Bic ballpoint pens box of 50", 650, "Stationery", "Blue Bic Cristal ballpoint pens, box of 50.", [["Brand", "Bic"], ["Pen type", "Ballpoint"], ["Pack", "50 pens"], ["Ink", "Blue"]], { brand: "Bic" }),
    good("Pilot G2 gel pens pack of 3", 450, "Stationery", "Smooth gel pens in black, blue and red.", [["Brand", "Pilot"], ["Pen type", "Gel"], ["Pack", "3 pens"]], { brand: "Pilot" }),
    good("Whiteboard markers pack of 4", 380, "Stationery", "Dry erase whiteboard markers, assorted colours.", [["Pen type", "Whiteboard marker"], ["Pack", "4 markers"], ["Colours", "Black, blue, red, green"]]),
    good("Kasuku exercise books A5 96 pages, pack of 10", 520, "Stationery", "Ruled exercise books for school.", [["Brand", "Kasuku"], ["Paper size", "A5"], ["Pages", "96"], ["Pack", "10 pcs"]], { brand: "Kasuku" }),
    good("Typek A4 printing paper ream 80gsm", 750, "Stationery", "500 sheets of A4 80 gsm paper.", [["Brand", "Typek"], ["Paper size", "A4"], ["Sheets", "500"], ["Weight", "80 gsm"]], { brand: "Typek" }),
    good("Whiteboard 90 x 120 cm wall mounted, magnetic", 4800, "Whiteboards", "Magnetic whiteboard with aluminium frame and marker tray.", [["Board size", "90 x 120 cm"], ["Mounting", "Wall mounted"], ["Magnetic", "Yes"]]),
    good("Whiteboard 120 x 240 cm on a stand", 14500, "Whiteboards", "Large double sided whiteboard on a mobile stand with wheels.", [["Board size", "120 x 240 cm"], ["Mounting", "On a stand with wheels"], ["Sides", "Double sided"]]),
    good("Scientific calculator Casio fx-991", 2200, "Stationery", "Casio fx-991 for secondary school and college.", [["Brand", "Casio"], ["Type", "Scientific calculator"]], { brand: "Casio" }),
    item("Colour printing A4 per page", 30, "Printing", "Full colour A4 prints from your flash disk, phone or email.", [["Paper size", "A4"], ["Colour", "Full colour"], ["Ready in", "While you wait"]], { kind: "service" }),
    item("Lamination A4", 60, "Printing", "Hot lamination for certificates and IDs.", [["Paper size", "A4"], ["Ready in", "While you wait"]], { kind: "service" }),
    item("KRA PIN registration", 200, "Online services", "We register your KRA PIN on iTax and print the certificate.", [["Service", "KRA iTax"], ["Ready in", "Same day"]], { kind: "service" })
  ],
  // Computer shop: monitors and storage
  "kisumu-tech-zone": [
    good("Samsung 27 inch curved monitor 75Hz", 21500, "Monitors", "27 inch curved Full HD monitor with HDMI and VGA.", [["Brand", "Samsung"], ["Screen size", "27 inch"], ["Resolution", "Full HD 1080p"], ["Refresh rate", "75 Hz"], ["Panel", "VA, curved"], ["Ports", "HDMI, VGA"]], { brand: "Samsung" }),
    good("Dell 24 inch IPS monitor 100Hz", 19800, "Monitors", "24 inch IPS Full HD monitor with thin bezels.", [["Brand", "Dell"], ["Screen size", "24 inch"], ["Resolution", "Full HD 1080p"], ["Refresh rate", "100 Hz"], ["Panel", "IPS"], ["Ports", "HDMI, VGA"]], { brand: "Dell" }),
    good("SanDisk Ultra 64GB USB 3.0 flash disk", 1100, "Storage", "Fast USB 3.0 flash drive.", [["Brand", "SanDisk"], ["Capacity", "64 GB"], ["USB", "USB 3.0"], ["Type", "Flash disk"]], { brand: "SanDisk" }),
    good("Kingston 32GB USB 2.0 flash disk", 650, "Storage", "Everyday USB 2.0 flash drive.", [["Brand", "Kingston"], ["Capacity", "32 GB"], ["USB", "USB 2.0"], ["Type", "Flash disk"]], { brand: "Kingston" }),
    good("Samsung T7 1TB portable SSD", 16500, "Storage", "Pocket-size external SSD with USB-C.", [["Brand", "Samsung"], ["Capacity", "1 TB"], ["USB", "USB-C, USB 3.2"], ["Type", "Portable SSD"]], { brand: "Samsung" })
  ],
  // Boutique: shirts
  "urban-threads-boutique": [
    good("Men's long sleeve official shirt, slim fit", 1800, "Shirts", "Cotton official shirt for the office.", [["Clothing", "Shirt"], ["Sleeve", "Long sleeve"], ["Fit", "Slim fit"], ["Fabric", "Cotton"], ["Sizes", "S, M, L, XL"]]),
    good("Men's short sleeve casual shirt", 1300, "Shirts", "Light linen-cotton shirt for weekends.", [["Clothing", "Shirt"], ["Sleeve", "Short sleeve"], ["Fit", "Regular fit"], ["Fabric", "Linen"], ["Sizes", "M, L, XL"]]),
    good("Polo t-shirt", 900, "Shirts", "Classic pique polo t-shirt.", [["Clothing", "T-shirt"], ["Sleeve", "Short sleeve"], ["Fabric", "Cotton"], ["Sizes", "S, M, L, XL, XXL"]])
  ],
  // Eatery: plates of pilau and a menu
  "mama-pima-kitchen": [
    good("Beef pilau full plate", 350, "Menu", "Spiced pilau rice with tender beef, kachumbari on the side.", [["Main", "Beef"], ["Portion", "Full plate"], ["Cuisine", "Swahili"], ["Meal", "Lunch and dinner"]]),
    good("Chicken pilau half plate", 250, "Menu", "Half plate of chicken pilau with kachumbari.", [["Main", "Chicken"], ["Portion", "Half plate"], ["Cuisine", "Swahili"], ["Meal", "Lunch and dinner"]]),
    good("Chips masala", 200, "Menu", "Fries tossed in a spicy tomato masala.", [["Portion", "Regular"], ["Cuisine", "Fast food"], ["Dietary", "Vegetarian"]]),
    good("Chai and mandazi", 80, "Menu", "Kenyan milk tea with two fresh mandazi.", [["Meal", "Breakfast"], ["Portion", "Regular"], ["Dietary", "Vegetarian"]]),
    good("Ugali beef stew", 250, "Menu", "Ugali with beef stew and sukuma wiki.", [["Main", "Beef"], ["Portion", "Full plate"], ["Cuisine", "Kenyan"]]),
    good("Family pilau platter for 4", 1300, "Menu", "Beef pilau for four with kachumbari and four sodas.", [["Main", "Beef"], ["Portion", "Sharing for 4"], ["Cuisine", "Swahili"]])
  ],
  // Salon and spa: massages
  "glow-beauty-parlour": [
    item("Full body Swedish massage 60 min", 3000, "Spa and massage", "Relaxing full body massage with warm oils.", [["Treatment", "Swedish massage"], ["Duration", "60 minutes"], ["Where", "At the spa or home service"], ["Booking", "Appointment required"]], { kind: "service" }),
    item("Deep tissue massage 90 min", 4500, "Spa and massage", "Firm pressure for tight muscles.", [["Treatment", "Deep tissue"], ["Duration", "90 minutes"], ["Booking", "Appointment required"]], { kind: "service" }),
    item("Foot reflexology 30 min", 1500, "Spa and massage", "Pressure point foot massage.", [["Treatment", "Foot reflexology"], ["Duration", "30 minutes"], ["Booking", "Walk-in or appointment"]], { kind: "service" }),
    item("Hot stone massage 75 min", 4000, "Spa and massage", "Warm basalt stones and massage oil.", [["Treatment", "Hot stone"], ["Duration", "75 minutes"], ["Booking", "Appointment required"]], { kind: "service" }),
    item("Couples massage 60 min", 5500, "Spa and massage", "Side by side Swedish massage for two.", [["Treatment", "Couples massage"], ["Duration", "60 minutes"], ["Booking", "Appointment required"]], { kind: "service" })
  ],
  // Tailor: dress making
  "stitch-and-style-tailors": [
    item("Dress making, made to measure", 2500, "Dress making", "We take your measurements and sew a dress in your style. Bring your own fabric or choose ours.", [["What is made", "Dresses"], ["Fabric", "Bring your own fabric or fabric included at extra cost"], ["Ready in", "3 to 5 days"]], { kind: "service" }),
    item("School uniform sewing", 1200, "Dress making", "Shirts, skirts and trousers for school uniforms.", [["What is made", "School uniforms"], ["Ready in", "Within a week"]], { kind: "service" }),
    item("Express hemming", 150, "Alterations", "Trouser and dress hemming while you wait.", [["What is made", "Alterations"], ["Ready in", "Same day, while you wait"]], { kind: "service" })
  ]
};
