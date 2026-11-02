import { slugify } from "@epicmkt/shared";

const item = (name, price, section, description, specs, extra = {}) => ({
  name,
  priceKes: price,
  section,
  description,
  specs: specs.map(([label, value, group]) => ({ label, value, ...(group ? { group } : {}) })),
  ...extra
});

const WALK = ["Booking", "Walk-in or appointment"];
const CLEAN = ["Hygiene", "Sterilised tools"];

const barber = [
  item("Haircut", 150, "Cuts", "Clean cut with clippers and scissors, finished with a neck shave.", [["Duration", "30 minutes"], ["Tools", "Clippers and scissors"], ["Finish", "Neck shave and dusting"], CLEAN, WALK]),
  item("Fade and beard", 300, "Cuts", "Skin or taper fade with full beard shaping and line-up.", [["Duration", "45 minutes"], ["Fade styles", "Skin, taper, low, high"], ["Beard", "Shaping and line-up"], ["Finish", "Hot towel"], CLEAN, WALK], { duration: "45 minutes" }),
  item("Kids cut", 100, "Cuts", "Patient barbers for children under 12.", [["Age", "Under 12"], ["Duration", "20 minutes"], ["Seat", "Booster provided"], ["Styles", "Standard, fade, crew cut"], ["Parent", "Stays in the shop"]], { availability: "limited" }),
  item("Line-up", 80, "Cuts", "Sharp edges on the hairline and temples.", [["Duration", "10 minutes"], ["Areas", "Hairline and temples"], ["Tool", "Edge trimmer"], ["Lasts", "1 to 2 weeks"], WALK]),
  item("Shave", 80, "Shaves", "Smooth shave with foam and a fresh blade.", [["Duration", "15 minutes"], ["Method", "Foam and razor"], ["Blade", "Fresh blade per client"], ["Aftercare", "Alcohol-free balm"], WALK]),
  item("Hot towel shave", 250, "Shaves", "Steam, lather and straight razor with a cool towel finish.", [["Duration", "35 minutes"], ["Steps", "Steam, lather, razor, cool towel"], ["Products", "Pre-shave oil and balm"], ["Blade", "Fresh blade per client"], ["Booking", "Appointment advised"]]),
  item("Beard trim", 100, "Shaves", "Trim and shape with beard oil to finish.", [["Duration", "15 minutes"], ["Tools", "Trimmer and scissors"], ["Shaping", "Natural or sharp"], ["Finish", "Beard oil"], WALK]),
  item("Hair dye", 200, "Treatments", "Black, brown or grey cover applied with gloves and cape.", [["Colours", "Black, brown, grey cover"], ["Duration", "40 minutes"], ["Patch test", "On request"], ["Includes", "Gloves and cape"], ["Booking", "Appointment advised"]]),
  item("Scalp massage", 150, "Treatments", "Relaxing massage with coconut or menthol oil.", [["Duration", "15 minutes"], ["Oils", "Coconut or menthol"], ["Suited to", "Dry or tight scalp"], ["Add-on", "With any cut"], WALK]),
  item("Dreadlock retwist", 500, "Locs", "Neat retwist with palm roll or interlock.", [["Duration", "1 to 2 hours"], ["Method", "Palm roll or interlock"], ["Hair length", "Any"], ["Lasts", "3 to 4 weeks"], ["Booking", "Appointment required"]])
];

const salon = [
  item("Wash and blow-dry", 500, "Hair", "Shampoo, conditioner and a smooth blow-dry.", [["Duration", "1 hour"], ["Includes", "Shampoo and conditioner"], ["Finish", "Blow-dry and style"], ["Hair types", "All"], ["Booking", "Appointment advised"]]),
  item("Manicure", 600, "Nails", "Shape, cuticle care and polish.", [["Duration", "45 minutes"], ["Includes", "Shaping and cuticle care"], ["Polish", "Choice of colours"], ["Lasts", "1 to 2 weeks"], ["Hygiene", "Tools sterilised"]]),
  item("Box braids", 2500, "Braids", "Neat box braids in your chosen length. Hair not included.", [["Duration", "4 to 6 hours"], ["Lasts", "4 to 6 weeks"], ["Hair", "Bring your own"], ["Deposit", "KES 500"], ["Booking", "Appointment required"]]),
  item("Cornrows", 800, "Braids", "Straight-back or styled cornrows.", [["Duration", "1 to 2 hours"], ["Styles", "Straight-back, patterned"], ["Lasts", "2 to 3 weeks"], ["Hair", "Natural or extensions"], ["Booking", "Appointment advised"]]),
  item("Wig install", 1200, "Wigs", "Wig fitting, styling and install.", [["Duration", "1 to 2 hours"], ["Includes", "Fit, cut and style"], ["Wig", "Bring your own"], ["Lasts", "2 to 4 weeks"], ["Booking", "Appointment required"]], { availability: "limited" }),
  item("Pedicure", 700, "Nails", "Foot soak, scrub, shaping and polish.", [["Duration", "1 hour"], ["Includes", "Soak, scrub, shaping"], ["Polish", "Choice of colours"], ["Hygiene", "Tools sterilised"], ["Booking", "Walk-in or appointment"]]),
  item("Relaxer", 1500, "Hair", "Relaxer with neutralising wash and conditioning.", [["Duration", "2 hours"], ["Includes", "Wash and conditioning"], ["Patch test", "On request"], ["Hair length", "Any"], ["Booking", "Appointment required"]]),
  item("Silk press", 1800, "Hair", "Heat-styled straight finish with protective serum.", [["Duration", "2 hours"], ["Includes", "Wash and heat protection"], ["Finish", "Smooth and straight"], ["Lasts", "1 to 2 weeks"], ["Booking", "Appointment required"]]),
  item("Gel nails", 1200, "Nails", "Gel polish cured under a lamp.", [["Duration", "1 hour"], ["Finish", "Glossy gel"], ["Lasts", "2 to 3 weeks"], ["Removal", "Soak-off available"], ["Booking", "Appointment advised"]]),
  item("Makeup", 2000, "Beauty", "Full-face makeup for events.", [["Duration", "1 hour"], ["Includes", "Foundation, eyes, lips"], ["Lashes", "Available on request"], ["Trial", "Book ahead"], ["Booking", "Appointment required"]])
];

const gym = [
  item("Day pass", 400, "Passes", "Full gym access for one day.", [["Valid for", "Same day"], ["Hours", "6am to 9pm"], ["Facilities", "Weights, cardio, showers"], ["Classes", "Not included"], ["Sign-up fee", "None"]]),
  item("Weekly pass", 1200, "Passes", "Seven days of unlimited access.", [["Valid for", "7 days"], ["Hours", "6am to 9pm"], ["Facilities", "Weights, cardio, showers"], ["Classes", "Not included"], ["Sign-up fee", "None"]]),
  item("Monthly membership", 4500, "Memberships", "Unlimited access for 30 days with group classes.", [["Valid for", "30 days"], ["Hours", "5am to 10pm"], ["Facilities", "Weights, cardio, showers, lockers"], ["Classes", "Included"], ["Induction", "Free"], ["Sign-up fee", "KES 500"], ["Freeze", "Up to 7 days"], ["Payment", "M-Pesa or cash"], ["ID", "Required at sign-up"]], { term: "30 days" }),
  item("Quarterly membership", 12000, "Memberships", "Three months at a lower monthly rate.", [["Valid for", "90 days"], ["Hours", "5am to 10pm"], ["Facilities", "Weights, cardio, showers, lockers"], ["Classes", "Included"], ["Freeze", "Up to 14 days"]], { term: "90 days" }),
  item("Annual membership", 40000, "Memberships", "Twelve months of access at the best rate.", [["Valid for", "12 months"], ["Hours", "5am to 10pm"], ["Classes", "Included"], ["Freeze", "Up to 30 days"], ["Guest passes", "4 per year"]], { term: "12 months" }),
  item("Student monthly", 3200, "Memberships", "Discounted monthly access with a valid student ID.", [["Valid for", "30 days"], ["Hours", "6am to 9pm"], ["Classes", "Included"], ["ID", "Valid student ID"], ["Sign-up fee", "None"]], { term: "30 days" }),
  item("Couples monthly", 7500, "Memberships", "Two people on one monthly plan.", [["Valid for", "30 days"], ["People", "2"], ["Hours", "5am to 10pm"], ["Classes", "Included"], ["Sign-up fee", "KES 500"]], { term: "30 days" }),
  item("Personal training session", 1500, "Training", "One-on-one session with a certified trainer.", [["Duration", "1 hour"], ["Trainer", "Certified"], ["Includes", "Plan and form coaching"], ["Booking", "24 hours ahead"], ["Cancel", "Free up to 12 hours before"]], { duration: "1 hour" }),
  item("Group class drop-in", 500, "Training", "Single group class without a membership.", [["Duration", "45 minutes"], ["Classes", "Circuit, aerobics, spin"], ["Level", "All levels"], ["Booking", "Walk-in if space allows"]], { duration: "45 minutes" }),
  item("Locker and towel monthly", 600, "Add-ons", "Personal locker and fresh towels for a month.", [["Valid for", "30 days"], ["Locker", "Personal, own padlock"], ["Towels", "Fresh daily"], ["Deposit", "KES 200 refundable"]], { term: "30 days" })
];

const rx = (form, strength, pack, rxNeeded, extra = []) => [["Form", form], ["Strength", strength], ["Pack size", pack], ["Prescription", rxNeeded ? "Required" : "Not required"], ["Storage", "Cool, dry place"], ...extra];

const chemist = [
  item("Paracetamol 500mg", 40, "Pain and fever", "Pain and fever relief tablets.", rx("Tablet", "500 mg", "16 tablets", false, [["Ask first", "Check with a pharmacist for children"]]), { packSize: "16 tablets", brand: "Panadol", highlights: ["Relieves pain and fever", "Easy to swallow", "Pharmacist advice for children"] }),
  item("Ibuprofen 400mg", 60, "Pain and fever", "Anti-inflammatory pain relief tablets.", rx("Tablet", "400 mg", "10 tablets", false, [["Ask first", "Check with a pharmacist if unsure"]]), { packSize: "10 tablets" }),
  item("Oral rehydration salts", 30, "Everyday care", "Sachet for replacing fluids and salts.", rx("Powder sachet", "Standard", "1 sachet", false, [["Preparation", "Follow the sachet instructions"]]), { packSize: "1 sachet" }),
  item("Cetirizine 10mg", 50, "Allergy", "Antihistamine tablets for allergy symptoms.", rx("Tablet", "10 mg", "10 tablets", false), { packSize: "10 tablets" }),
  item("Zinc 20mg", 80, "Everyday care", "Dispersible zinc tablets.", rx("Dispersible tablet", "20 mg", "10 tablets", false), { packSize: "10 tablets" }),
  item("Multivitamin 30 tablets", 450, "Supplements", "Daily multivitamin and mineral tablets.", rx("Tablet", "Multivitamin", "30 tablets", false, [["Shelf life", "See pack for expiry"]]), { packSize: "30 tablets", brand: "Centrum", highlights: ["One tablet a day", "Vitamins and minerals"] }),
  item("Amoxicillin 500mg", 180, "Prescription", "Antibiotic capsules, sold on prescription only.", rx("Capsule", "500 mg", "10 capsules", true, [["Dispensing", "By a registered pharmacist"]]), { packSize: "10 capsules", availability: "limited" }),
  item("Digital thermometer", 350, "Equipment", "Fast-read digital thermometer.", [["Type", "Digital"], ["Read time", "About 10 seconds"], ["Battery", "Included"], ["Display", "LCD"], ["Warranty", "6 months"]]),
  item("Blood pressure check", 50, "Health checks", "Quick blood pressure reading by a trained attendant.", [["Duration", "5 minutes"], ["Done by", "Trained attendant"], ["Walk-in", "Yes"], ["Records", "Reading written down on request"]], { kind: "service", duration: "5 minutes" }),
  item("Sugar test", 100, "Health checks", "Finger-prick blood sugar test.", [["Duration", "5 minutes"], ["Done by", "Trained attendant"], ["Fasting", "Tell the attendant if you have fasted"], ["Walk-in", "Yes"]], { kind: "service", duration: "5 minutes" })
];

const agro = [
  item("Certified maize seed 2kg", 650, "Seed", "Certified hybrid maize seed for the long rains.", [["Pack size", "2 kg"], ["Maturity", "120 to 140 days"], ["Germination", "90% minimum"], ["Certified", "Yes"], ["Best season", "Long rains"]], { packSize: "2 kg" }),
  item("Dairy meal 70kg", 2900, "Feeds", "Balanced dairy ration for milking cows.", [["Pack size", "70 kg"], ["Protein", "16%"], ["For", "Dairy cows"], ["Form", "Meal"], ["Storage", "Dry, off the floor"]], { packSize: "70 kg" }),
  item("DAP fertilizer 50kg", 5800, "Fertilizer", "Planting fertilizer high in phosphorus.", [["Pack size", "50 kg"], ["Use", "At planting"], ["Form", "Granules"], ["Nutrients", "N, P"], ["Storage", "Dry place"]], { packSize: "50 kg" }),
  item("CAN fertilizer 50kg", 4900, "Fertilizer", "Top-dressing fertilizer.", [["Pack size", "50 kg"], ["Use", "Top dressing"], ["Form", "Granules"], ["Nutrients", "N, Ca"], ["Storage", "Dry place"]], { packSize: "50 kg" }),
  item("Tomato seed hybrid 10g", 600, "Seed", "Hybrid tomato seed for open field or greenhouse.", [["Pack size", "10 g"], ["Type", "Hybrid"], ["Maturity", "75 to 90 days"], ["Germination", "85% minimum"], ["Grown", "Open field or greenhouse"]], { packSize: "10 g" }),
  item("Sukuma wiki seed 100g", 150, "Seed", "Open-pollinated kale seed.", [["Pack size", "100 g"], ["Type", "Open-pollinated"], ["First harvest", "6 to 8 weeks"], ["Germination", "85% minimum"]], { packSize: "100 g" }),
  item("Cattle dewormer 100ml", 450, "Animal health", "Oral dewormer for cattle.", [["Pack size", "100 ml"], ["Animal", "Cattle"], ["Form", "Oral liquid"], ["Advice", "Ask the agrovet for the right amount"], ["Storage", "Cool, dry place"]], { packSize: "100 ml" }),
  item("Acaricide 1L", 1200, "Animal health", "Tick control concentrate.", [["Pack size", "1 litre"], ["Animal", "Cattle, goats"], ["Form", "Concentrate"], ["Handling", "Wear gloves"], ["Storage", "Locked, away from children"]], { packSize: "1 litre" }),
  item("Knapsack sprayer 16L", 3200, "Equipment", "Manual backpack sprayer.", [["Capacity", "16 litres"], ["Type", "Manual lever"], ["Straps", "Padded"], ["Nozzle", "Adjustable"], ["Warranty", "3 months"]]),
  item("Layers mash 70kg", 3300, "Feeds", "Complete feed for laying hens.", [["Pack size", "70 kg"], ["For", "Laying hens"], ["Form", "Mash"], ["Protein", "16%"], ["Storage", "Dry, off the floor"]], { packSize: "70 kg" })
];

const kitchen = [
  item("Aluminium sufuria set 3 pcs", 1800, "Cookware", "Three-piece aluminium sufuria set with lids.", [["Pieces", "3 with lids"], ["Material", "Aluminium"], ["Sizes", "20, 24, 28 cm"], ["Handles", "Heat-resistant"], ["Use", "Gas or charcoal"], ["Warranty", "3 months"]]),
  item("Non-stick frying pan 28cm", 1500, "Cookware", "Non-stick pan for everyday frying.", [["Diameter", "28 cm"], ["Material", "Aluminium with coating"], ["Handle", "Cool-touch"], ["Use", "Gas or electric"], ["Care", "Wooden or plastic utensils"]]),
  item("Pressure cooker 5L", 4200, "Cookware", "Aluminium pressure cooker for beans and meat.", [["Capacity", "5 litres"], ["Material", "Aluminium"], ["Diameter", "22 cm"], ["Weight", "2.4 kg"], ["Safety", "Pressure valve and locking lid"], ["Use", "Gas or electric coil"], ["Gasket", "Replaceable"], ["Colour", "Silver"], ["Warranty", "6 months"]]),
  item("Two-burner gas cooker", 3800, "Appliances", "Tabletop two-burner gas cooker.", [["Burners", "2"], ["Body", "Stainless steel top"], ["Ignition", "Auto"], ["Gas", "LPG"], ["Dimensions", "70 x 38 cm"], ["Warranty", "6 months"]]),
  item("Thermos flask 1L", 1200, "Drinkware", "Vacuum flask that keeps drinks hot or cold.", [["Capacity", "1 litre"], ["Material", "Stainless steel"], ["Keeps hot", "Up to 12 hours"], ["Lid", "Screw cup"], ["Colour", "Assorted"]], { brand: "Thermos", highlights: ["Keeps drinks hot for 12 hours", "Stainless steel body", "Screw cup lid"] }),
  item("Stainless steel spoon set 5 pcs", 650, "Utensils", "Five cooking and serving spoons.", [["Pieces", "5"], ["Material", "Stainless steel"], ["Includes", "Spoon, ladle, slotted, turner, masher"], ["Hanging hole", "Yes"]]),
  item("Plastic basin 20L", 350, "Household", "Sturdy basin for washing and storage.", [["Capacity", "20 litres"], ["Material", "Food-grade plastic"], ["Handles", "Moulded"], ["Colour", "Assorted"]]),
  item("Water jug 2L", 400, "Drinkware", "Jug with lid for water or juice.", [["Capacity", "2 litres"], ["Material", "Plastic"], ["Lid", "Snap-on"], ["Dishwasher", "Top rack"]]),
  item("Chopping board", 450, "Utensils", "Hard-wearing board for kitchen prep.", [["Material", "Wood"], ["Size", "35 x 25 cm"], ["Thickness", "2 cm"], ["Care", "Hand wash"]], { availability: "limited" }),
  item("Kitchen knife set 6 pcs", 1600, "Utensils", "Six knives with a block.", [["Pieces", "6"], ["Blade", "Stainless steel"], ["Handle", "Plastic"], ["Block", "Included"], ["Care", "Hand wash"], ["Warranty", "3 months"]])
];


const phonesPack = [
  item("Tecno Spark 20 128GB", 15500, "Phones", "Dual SIM smartphone with a large display and all-day battery.", [["Storage", "128 GB"], ["RAM", "8 GB"], ["Screen", "6.6 inch HD+"], ["Battery", "5000 mAh"], ["Warranty", "1 year"], ["Condition", "New, sealed"]], { brand: "Tecno" }),
  item("Samsung Galaxy A15 128GB", 21500, "Phones", "Mid-range Samsung with AMOLED screen and 50MP camera.", [["Storage", "128 GB"], ["RAM", "4 GB"], ["Screen", "6.5 inch Super AMOLED"], ["Camera", "50 MP main"], ["Warranty", "1 year"], ["Condition", "New, sealed"]], { brand: "Samsung" }),
  item("Infinix Hot 40i 128GB", 13200, "Phones", "Budget phone with a 90Hz screen and fast charging.", [["Storage", "128 GB"], ["RAM", "4 GB"], ["Screen", "6.56 inch 90Hz"], ["Battery", "5000 mAh"], ["Warranty", "1 year"]], { brand: "Infinix" }),
  item("Refurbished iPhone 11 64GB", 32000, "Phones", "Tested iPhone 11, battery health above 85 percent.", [["Storage", "64 GB"], ["Condition", "Refurbished, grade A"], ["Battery health", "85 percent or more"], ["Warranty", "3 months"], ["Includes", "Charger and cable"]], { brand: "Apple", availability: "limited" }),
  item("Fast charger 25W with cable", 1200, "Chargers and cables", "USB-C wall charger with a braided cable.", [["Power", "25 W"], ["Port", "USB-C"], ["Cable length", "1 metre"], ["Compatible", "Most Android phones"], ["Warranty", "6 months"]]),
  item("Power bank 20000mAh", 2800, "Chargers and cables", "Two-port power bank with a battery level display.", [["Capacity", "20000 mAh"], ["Ports", "2 USB, 1 USB-C"], ["Charging", "Fast charge 18 W"], ["Display", "Digital level"], ["Warranty", "6 months"]]),
  item("Tempered glass screen protector", 300, "Cases and protectors", "9H glass protector, fitted free in the shop.", [["Hardness", "9H"], ["Fitting", "Free in shop"], ["Finish", "Clear"], ["Compatible", "Most popular models"], ["Replacement", "Ask the seller"]]),
  item("Silicone phone case", 450, "Cases and protectors", "Soft shock-absorbing case in assorted colours.", [["Material", "Silicone"], ["Colours", "Assorted"], ["Protection", "Edge and corner"], ["Compatible", "Choose your model"], ["Fit", "Snug"]]),
  item("Wireless earbuds", 2200, "Audio", "Bluetooth earbuds with a charging case.", [["Bluetooth", "5.3"], ["Battery", "6 hours plus case"], ["Case", "Charging case included"], ["Microphone", "Built in"], ["Warranty", "6 months"]]),
  item("Screen replacement fitting", 1500, "Repairs", "Screen fitting for most common models, ready in hours.", [["Time", "1 to 3 hours"], ["Parts", "Quality replacement screens"], ["Warranty", "30 days"], ["Price", "Fitting only, screen extra"], ["Booking", "Walk-in"]], { kind: "service" })
];

const electronicsPack = [
  item("HP 15 laptop Core i5 8GB 512GB", 62000, "Laptops", "Everyday laptop for work and study.", [["Processor", "Intel Core i5"], ["RAM", "8 GB"], ["Storage", "512 GB SSD"], ["Screen", "15.6 inch"], ["Warranty", "1 year"], ["Condition", "New"]], { brand: "HP" }),
  item("Dell Latitude refurbished Core i5", 38000, "Laptops", "Business laptop, tested and cleaned.", [["Processor", "Intel Core i5"], ["RAM", "8 GB"], ["Storage", "256 GB SSD"], ["Condition", "Refurbished, grade A"], ["Warranty", "6 months"]], { brand: "Dell" }),
  item("Lenovo IdeaPad Celeron 4GB", 29500, "Laptops", "Light laptop for browsing, typing and online classes.", [["Processor", "Intel Celeron"], ["RAM", "4 GB"], ["Storage", "256 GB SSD"], ["Screen", "14 inch"], ["Warranty", "1 year"]], { brand: "Lenovo" }),
  item("24 inch LED monitor", 14500, "Monitors", "Full HD monitor with HDMI and VGA.", [["Size", "24 inch"], ["Resolution", "1920 x 1080"], ["Ports", "HDMI, VGA"], ["Panel", "IPS"], ["Warranty", "1 year"]]),
  item("Epson EcoTank L3250 printer", 28500, "Printers", "Refillable ink printer, scanner and copier with Wi-Fi.", [["Functions", "Print, scan, copy"], ["Wi-Fi", "Yes"], ["Ink", "Refillable tanks"], ["Warranty", "1 year"], ["Includes", "Starter ink set"]], { brand: "Epson" }),
  item("Wireless keyboard and mouse combo", 1900, "Accessories", "Compact wireless set with a USB receiver.", [["Connection", "2.4 GHz USB"], ["Battery", "AA, included"], ["Layout", "Full size"], ["Compatible", "Windows and Mac"], ["Warranty", "6 months"]]),
  item("Flash disk 64GB", 900, "Accessories", "USB 3.0 flash disk.", [["Capacity", "64 GB"], ["Interface", "USB 3.0"], ["Speed", "Up to 100 MB/s"], ["Warranty", "6 months"]]),
  item("43 inch smart TV", 32500, "TVs", "Full HD smart TV with apps and Wi-Fi.", [["Size", "43 inch"], ["Resolution", "Full HD"], ["Smart", "Android TV"], ["Ports", "3 HDMI, 2 USB"], ["Warranty", "1 year"], ["Delivery", "Available"]]),
  item("Wi-Fi router dual band", 4200, "Networking", "Dual-band router for home and small offices.", [["Bands", "2.4 and 5 GHz"], ["Speed", "AC1200"], ["Ports", "4 LAN"], ["Setup", "Free in town"], ["Warranty", "1 year"]]),
  item("Laptop service and cleaning", 1500, "Repairs", "Dust clean, thermal paste and software check.", [["Time", "1 day"], ["Includes", "Cleaning and thermal paste"], ["Checks", "Disk and battery"], ["Warranty", "14 days"], ["Booking", "Walk-in"]], { kind: "service" })
];

const fashionPack = [
  item("Ladies Ankara dress", 2200, "Dresses and tops", "Knee-length Ankara dress in bright prints.", [["Fabric", "Cotton Ankara"], ["Sizes", "S to XXL"], ["Length", "Knee length"], ["Care", "Hand wash"], ["Condition", "New"]]),
  item("Ladies office blouse", 1200, "Dresses and tops", "Smart blouse for the office.", [["Fabric", "Polyester blend"], ["Sizes", "S to XL"], ["Colours", "White, blue, black"], ["Care", "Machine wash"], ["Condition", "New"]]),
  item("Men's slim fit jeans", 1800, "Trousers and jeans", "Stretch denim jeans.", [["Fabric", "Stretch denim"], ["Waist sizes", "28 to 40"], ["Fit", "Slim"], ["Colours", "Blue, black"], ["Condition", "New"]]),
  item("Men's official shoes leather", 3800, "Footwear", "Lace-up leather shoes for work and events.", [["Material", "Leather"], ["Sizes", "39 to 46"], ["Colours", "Black, brown"], ["Sole", "Rubber"], ["Condition", "New"]]),
  item("Women's sandals", 1300, "Footwear", "Flat comfortable sandals.", [["Material", "Synthetic leather"], ["Sizes", "36 to 42"], ["Colours", "Black, tan, gold"], ["Sole", "Non-slip"], ["Condition", "New"]]),
  item("Canvas sneakers", 2000, "Footwear", "Everyday canvas sneakers for men and women.", [["Material", "Canvas"], ["Sizes", "36 to 45"], ["Colours", "White, black, navy"], ["Sole", "Rubber"], ["Condition", "New"]]),
  item("Kids school shoes", 1500, "Footwear", "Hard-wearing black school shoes.", [["Sizes", "28 to 38"], ["Colour", "Black"], ["Material", "Synthetic leather"], ["Sole", "Non-slip"], ["Condition", "New"]]),
  item("Ladies handbag", 1600, "Bags and accessories", "Medium handbag with shoulder strap.", [["Material", "Synthetic leather"], ["Size", "Medium"], ["Colours", "Black, brown, red"], ["Pockets", "Inside zip pocket"], ["Condition", "New"]]),
  item("Mitumba jackets", 600, "Mitumba", "Sorted second-hand jackets and sweaters.", [["Condition", "Second-hand, sorted"], ["Sizes", "Mixed"], ["Types", "Jackets and sweaters"], ["New stock", "Tuesday and Friday"]], { availability: "limited" })
];

const homeKitchenPack = [
  item("Non-stick sufuria set 5 pcs", 3200, "Cookware", "Five non-stick sufurias with glass lids.", [["Pieces", "5 with lids"], ["Material", "Aluminium, non-stick"], ["Sizes", "16 to 28 cm"], ["Use", "Gas and electric"], ["Warranty", "3 months"]]),
  item("Electric kettle 1.8L", 1600, "Appliances", "Cordless kettle with auto shut-off.", [["Capacity", "1.8 litres"], ["Power", "1800 W"], ["Safety", "Auto shut-off"], ["Body", "Stainless steel"], ["Warranty", "1 year"]], { brand: "Ramtons" }),
  item("Blender 1.5L", 4500, "Appliances", "Strong blender with two speeds and a pulse button.", [["Capacity", "1.5 litres"], ["Power", "500 W"], ["Jar", "Glass"], ["Speeds", "2 plus pulse"], ["Warranty", "1 year"]]),
  item("Dinner set 24 pcs", 4800, "Dinnerware", "Plates, bowls and cups for six people.", [["Pieces", "24"], ["Serves", "6 people"], ["Material", "Ceramic"], ["Care", "Dishwasher safe"], ["Gift box", "Available"]]),
  item("Cutlery set 24 pcs", 1900, "Dinnerware", "Stainless steel spoons, forks and knives.", [["Pieces", "24"], ["Material", "Stainless steel"], ["Includes", "Forks, knives, spoons, teaspoons"], ["Case", "Storage tray"]]),
  item("Storage containers 10 pcs", 1400, "Storage", "Airtight food containers with lids.", [["Pieces", "10"], ["Material", "Food-grade plastic"], ["Use", "Fridge and pantry"], ["Lids", "Airtight"], ["Microwave", "Safe without lid"]]),
  item("Cotton bedsheet set double", 2400, "Bedding", "Bedsheet with two pillowcases.", [["Size", "Double, 6 x 6"], ["Fabric", "Cotton blend"], ["Includes", "Fitted sheet and 2 pillowcases"], ["Colours", "Assorted"], ["Care", "Machine wash"]]),
  item("Curtains pair 2 metres", 2800, "Curtains and rugs", "Ready-made curtains with hooks.", [["Size", "2 metres drop"], ["Fabric", "Polyester"], ["Includes", "Pair with hooks"], ["Colours", "Assorted"], ["Care", "Machine wash"]]),
  item("Bathroom mat and towel set", 1500, "Bathroom", "Soft towels with a non-slip mat.", [["Pieces", "3 towels and 1 mat"], ["Fabric", "Cotton"], ["Colours", "Assorted"], ["Care", "Machine wash"]]),
  item("Gift basket for a new home", 5500, "Gift sets", "Cookware, towels and a dinner set in one hamper.", [["Contents", "Sufuria, set of plates, towels"], ["Packaging", "Gift wrapped"], ["Occasion", "Wedding or housewarming"], ["Delivery", "Available"]])
];

const PACKS = { barbershops: barber, salons: salon, gyms: gym, chemists: chemist, agrovets: agro, hardware: kitchen, "phones-accessories": phonesPack, "electronics-computers": electronicsPack, "fashion-boutiques": fashionPack, "home-kitchen": homeKitchenPack };
const SERVICE_CATEGORIES = new Set(["barbershops", "salons", "gyms", "car-wash", "tailors", "mpesa", "mechanics", "phone-repair"]);
const PADDING = [["Availability", "Ask the seller"], ["Payment", "M-Pesa or cash"], ["Contact", "WhatsApp or call"], ["Prices", "Confirm with the seller"]];

const factorOf = (index) => 1 + (((index * 7) % 5) - 2) * 0.04;
const scale = (price, factor) => (price < 100 ? Math.max(5, Math.round((price * factor) / 5) * 5) : Math.round((price * factor) / 10) * 10);

const pad = (specs) => {
  const out = [...specs];
  for (const [label, value] of PADDING) {
    if (out.length >= 4) break;
    if (!out.some((s) => s.label === label)) out.push({ label, value });
  }
  return out;
};

export const defaultKind = (categoryId) => (SERVICE_CATEGORIES.has(categoryId) ? "service" : "product");

export function completeServices(categoryId, services, index) {
  const pack = PACKS[categoryId] ?? [];
  const byName = new Map(pack.map((entry) => [entry.name.toLowerCase(), entry]));
  const merged = services.map((svc) => {
    const match = byName.get(svc.name.toLowerCase());
    if (!match) return { ...svc, specs: pad(svc.specs ?? []) };
    const specs = (svc.specs?.length ?? 0) >= 4 ? svc.specs : match.specs;
    return { ...match, ...svc, specs };
  });
  const taken = new Set(merged.map((svc) => svc.name.toLowerCase()));
  const factor = factorOf(index);
  for (const entry of pack) {
    if (taken.has(entry.name.toLowerCase())) continue;
    merged.push({ ...entry, priceKes: scale(entry.priceKes, factor) });
  }
  const ids = new Set();
  return merged.map((svc) => {
    let id = svc.id ?? slugify(svc.name);
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    return { ...svc, id };
  });
}
