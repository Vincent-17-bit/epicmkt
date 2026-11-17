// Catalogue coverage, part 3: building and trades, solar and security, appliances, fashion extras, auto and motorbikes, events,
// transport and logistics. Trades are priced by the job, so their rows are about proof (licence, warranty, what is included).
import { ax, b, c, colour, n, o, rec, req, t, type } from "./lib.mjs";

const BRAND = { open: ["brand"] };

export const COVERAGE_HOME = [
  // ---- Hardware, trades, workshops ----------------------------------------------------------------------------------------
  type("hand-power-tools", "Hand and power tools", {
    dept: "hardware-building", cats: ["hardware-building", "plumbing-electrical", "welding-fabrication"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Drill", "Angle grinder", "Hammer", "Saw", "Spanner set", "Pliers", "Screwdriver set", "Tape measure", "Spirit level", "Welding machine", "Ladder", "Toolbox"] }), ax("size", "Size", { values: ["Small", "Medium", "Large"] })],
    rows: [req(o("brand", "Brand")), rec(c("power", "Power", ["Manual", "Corded", "Cordless", "Petrol"])), rec(t("power-rating", "Power rating (W or V)")), rec(t("warranty", "Warranty")), rec(b("tool-hire", "Available for hire"))],
    x: BRAND
  }),
  type("locks-hardware", "Locks, hinges and fittings", {
    dept: "hardware-building", cats: ["hardware-building", "welding-fabrication"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Padlock", "Door lock", "Mortise lock", "Hinge", "Handle", "Bolt", "Chain", "Hasp", "Cabinet lock", "Window latch"] }), ax("size", "Size", { values: ["Small", "Medium", "Large", "Heavy duty"] }), ax("finish", "Finish", { open: "finish", values: ["Brass", "Chrome", "Black", "Stainless"] })],
    rows: [req(o("brand", "Brand")), req(o("material", "Material")), rec(t("keys", "Number of keys")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand", "material", "finish"] }
  }),
  type("paint-supplies-finishes", "Paint brushes, rollers and finishing supplies", {
    dept: "hardware-building", cats: ["hardware-building"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Brush", "Roller", "Thinner", "Putty", "Sandpaper", "Masking tape", "Sealant", "Wood glue", "Silicone"] }), ax("size", "Size", { values: ["Small", "Medium", "Large", "1 L", "4 L"] })],
    rows: [req(o("brand", "Brand")), rec(t("coverage", "Coverage or use")), rec(t("dry-time", "Drying time"))],
    x: BRAND
  }),
  type("tool-hire", "Tool and equipment hire", {
    dept: "hardware-building", cats: ["hardware-building", "event-hire"], kind: "service",
    axes: [ax("item", "Item", { display: "text-card", values: ["Concrete mixer", "Scaffolding", "Generator", "Jackhammer", "Compactor", "Ladder", "Water pump", "Welding machine", "Wheelbarrow"] }), ax("period", "Hire period", { values: ["Hour", "Day", "Week", "Month"] })],
    rows: [req(t("deposit", "Deposit")), req(b("delivery", "Delivery and collection")), rec(b("operator", "Operator included")), rec(t("fuel", "Fuel policy"))],
    x: { priceRule: "per-duration" }
  }),
  type("plumbing-service", "Plumbing service", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Pipe repair", "Leak detection", "Toilet and sink fitting", "Water tank installation", "Water heater installation", "Drain unblocking", "Borehole", "Bathroom fit-out", "Sewer line"] }), ax("property", "Property", { values: ["Home", "Office", "Rental", "Hotel", "Factory"] })],
    rows: [req(t("licence", "Licence or certificate")), req(c("quote", "Quote", ["Free quote", "Quote on visit (paid)", "Fixed price"])), rec(b("emergency", "Emergency or same-day")), rec(t("warranty", "Warranty on work")), rec(b("materials", "Materials included")), rec(t("travel", "Travel cost"))],
    x: { priceRule: "per-job" }
  }),
  type("electrical-service", "Electrical and wiring service", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["House wiring", "Fault finding", "Socket and switch fitting", "Lighting installation", "DB board upgrade", "Generator hookup", "Earthing", "CCTV wiring", "Meter connection"] }), ax("property", "Property", { values: ["Home", "Office", "Rental", "Shop", "Factory"] })],
    rows: [req(t("licence", "EPRA licence class")), req(c("quote", "Quote", ["Free quote", "Quote on visit (paid)", "Fixed price"])), rec(b("emergency", "Emergency or same-day")), rec(t("warranty", "Warranty on work")), rec(b("materials", "Materials included"))],
    x: { priceRule: "per-job" }
  }),
  type("welding-fabrication", "Welding and metal fabrication", {
    dept: "hardware-building", cats: ["welding-fabrication"], kind: "service",
    axes: [ax("item", "Item", { display: "text-card", values: ["Gate", "Grill", "Door", "Window frame", "Staircase railing", "Security door", "Shop shutter", "Water tank stand", "Roof truss", "Custom work"] }), ax("material", "Material", { open: "material", values: ["Mild steel", "Stainless steel", "Aluminium", "Galvanised"] })],
    rows: [req(t("dimensions", "Dimensions or size range")), req(c("order", "Order", ["Ready-made", "Custom size"])), req(t("lead-time", "Days to make")), rec(b("delivery", "Delivery")), rec(b("installation", "Installation")), rec(t("finish", "Paint or finish"))],
    x: { open: ["material", "finish"], priceRule: "per-job" }
  }),
  type("furniture-custom-order", "Custom furniture (made to order)", {
    dept: "furniture", cats: ["furniture-carpentry"], kind: "service",
    axes: [ax("item", "Item", { display: "text-card", values: ["Bed", "Sofa set", "Wardrobe", "Kitchen cabinets", "TV unit", "Dining set", "Office desk", "Shelves", "Door"] }), ax("material", "Material", { open: "material", values: ["Mahogany", "Cypress", "Pine", "MDF", "Plywood", "Upholstered"] })],
    rows: [req(t("dimensions", "Dimensions")), req(t("lead-time", "Days to build")), rec(b("delivery", "Delivery")), rec(b("assembly", "Assembly")), rec(t("warranty", "Warranty")), rec(b("design-visit", "Free measuring visit"))],
    x: { open: ["material", "colour"], dimensionProfile: "generic" }
  }),
  type("house-cleaning", "House, office and carpet cleaning", {
    dept: "cleaning-laundry", cats: ["cleaning-laundry"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["House cleaning", "Deep cleaning", "Office cleaning", "Carpet cleaning", "Sofa cleaning", "Mattress cleaning", "Post-construction clean", "Window cleaning", "Move-in or move-out clean"] }), ax("size", "Property", { values: ["Bedsitter", "1 bedroom", "2 bedroom", "3 bedroom", "4 bedroom and above", "Office"] })],
    rows: [req(t("duration", "How long it takes")), req(t("team", "Team size")), rec(b("supplies", "Supplies and equipment brought")), rec(b("eco", "Eco-friendly products")), rec(t("area", "Areas served"))],
    x: { priceRule: "per-job" }
  }),
  type("fumigation-pest", "Fumigation and pest control", {
    dept: "cleaning-laundry", cats: ["cleaning-laundry"], kind: "service",
    axes: [ax("pest", "Pest", { values: ["Cockroaches", "Bed bugs", "Rodents", "Mosquitoes", "Termites", "Ants", "Fleas and ticks", "General"] }), ax("property", "Property", { values: ["Home", "Office", "Restaurant", "Farm", "Warehouse"] })],
    rows: [req(t("licence", "Registration (PCPB)")), req(t("chemicals", "Chemicals used")), req(t("return-time", "Safe to re-enter after")), rec(t("warranty", "Guarantee period")), rec(b("pet-safe", "Pet and child safe"))],
    x: { priceRule: "per-job" }
  }),
  // ---- Solar and security -------------------------------------------------------------------------------------------------
  type("solar-panel", "Solar panel", {
    dept: "batteries", cats: ["solar-energy", "electronics-appliances", "plumbing-electrical"],
    axes: [ax("power", "Power", { scale: "power", values: ["50 W", "100 W", "150 W", "200 W", "330 W", "450 W", "550 W"] }), ax("type", "Type", { values: ["Monocrystalline", "Polycrystalline", "Flexible", "Bifacial"] })],
    rows: [req(o("brand", "Brand")), req(t("voltage", "Voltage")), rec(t("warranty", "Warranty (years)")), rec(t("dimensions", "Dimensions")), rec(t("efficiency", "Efficiency (%)"))],
    x: BRAND
  }),
  type("solar-battery-inverter", "Solar battery, inverter and controller", {
    dept: "batteries", cats: ["solar-energy", "electronics-appliances", "plumbing-electrical"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Deep cycle battery", "Lithium battery", "Hybrid inverter", "Pure sine inverter", "Charge controller", "Solar charge kit"] }), ax("size", "Capacity", { values: ["100 Ah", "200 Ah", "1 kW", "3 kW", "5 kW", "10 kW"] })],
    rows: [req(o("brand", "Brand")), req(t("voltage", "System voltage")), req(c("chemistry", "Chemistry", ["Lead acid", "Gel", "AGM", "Lithium", "Not a battery"])), rec(t("warranty", "Warranty (years)")), rec(t("cycles", "Cycle life"))],
    x: BRAND
  }),
  type("solar-system-install", "Solar system and installation", {
    dept: "batteries", cats: ["solar-energy", "plumbing-electrical"], kind: "package",
    axes: [ax("size", "System", { values: ["Lighting kit", "300 W home kit", "1 kW", "3 kW", "5 kW", "10 kW and above"] }), ax("use", "Use", { values: ["Home", "Shop", "Farm", "Borehole pump", "Business", "Hotel"] })],
    rows: [req(t("includes", "What is included")), req(t("licence", "EPRA solar licence")), req(t("warranty", "Warranty on installation")), rec(b("payment-plan", "Payment plan (pay as you go)")), rec(b("site-visit", "Free site visit"))],
    x: { priceRule: "per-job" }
  }),
  type("cctv-camera-kit", "CCTV cameras and kits", {
    dept: "electronics", cats: ["security-cctv", "electronics-appliances"],
    axes: [ax("kit", "Kit", { values: ["Single camera", "2 cameras", "4 cameras", "8 cameras", "16 cameras", "Wireless camera", "Doorbell camera"] }), ax("resolution", "Resolution", { values: ["2 MP", "4 MP", "5 MP", "8 MP (4K)"] })],
    rows: [req(o("brand", "Brand")), req(c("night", "Night vision", ["Colour", "Infrared", "None"])), rec(t("storage", "Storage included")), rec(b("remote-view", "Phone viewing")), rec(t("warranty", "Warranty"))],
    x: BRAND
  }),
  type("alarm-electric-fence", "Alarms, electric fence and access control", {
    dept: "electronics", cats: ["security-cctv", "electronics-appliances"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Burglar alarm", "Electric fence energiser", "Fence wire", "Gate motor", "Intercom", "Biometric lock", "Smoke detector", "Panic button"] }), ax("size", "Size", { values: ["Home", "Small business", "Large site"] })],
    rows: [req(o("brand", "Brand")), rec(t("coverage", "Coverage")), rec(c("power", "Power", ["Mains", "Battery", "Solar", "Mains with backup"])), rec(t("warranty", "Warranty"))],
    x: BRAND
  }),
  type("security-install-maintenance", "Security installation and maintenance", {
    dept: "electronics", cats: ["security-cctv"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["CCTV installation", "Electric fence installation", "Alarm installation", "Maintenance plan", "System repair", "Remote monitoring", "Access control"] }), ax("property", "Property", { values: ["Home", "Shop", "Office", "School", "Factory", "Farm"] })],
    rows: [req(t("licence", "Registration or licence")), req(c("quote", "Quote", ["Free site visit", "Paid site visit", "Fixed price"])), rec(t("maintenance", "Maintenance plan")), rec(t("warranty", "Warranty on work")), rec(b("emergency", "Emergency callout"))],
    x: { priceRule: "per-job" }
  }),
  // ---- Appliances ---------------------------------------------------------------------------------------------------------
  type("fridge-freezer", "Fridge and freezer", {
    dept: "electronics", cats: ["electronics-appliances", "home-kitchen"],
    axes: [ax("size", "Capacity", { scale: "volume", values: ["90 L", "128 L", "200 L", "300 L", "400 L", "500 L"] }), colour()],
    rows: [req(o("brand", "Brand")), req(c("type", "Type", ["Single door", "Double door", "Side by side", "Chest freezer", "Upright freezer", "Mini bar"])), req(c("condition", "Condition", ["New", "Used", "Refurbished"])), rec(t("energy", "Energy rating")), rec(t("warranty", "Warranty (months)")), rec(b("installation", "Delivery and installation"))],
    x: { open: ["brand", "colour"] }
  }),
  type("cooker-microwave", "Cooker, microwave and oven", {
    dept: "electronics", cats: ["electronics-appliances", "home-kitchen"],
    axes: [ax("item", "Item", { values: ["Gas cooker", "Electric cooker", "Microwave", "Oven toaster", "Air fryer", "Hot plate", "Rice cooker"] }), ax("size", "Capacity", { values: ["20 L", "25 L", "30 L", "4 burner", "5 burner", "6 burner"] }), colour()],
    rows: [req(o("brand", "Brand")), req(t("power", "Power (W)")), req(c("condition", "Condition", ["New", "Used", "Refurbished"])), rec(t("warranty", "Warranty (months)")), rec(b("installation", "Installation"))],
    x: { open: ["brand", "colour"] }
  }),
  type("washing-machine", "Washing machine and dryer", {
    dept: "electronics", cats: ["electronics-appliances", "home-kitchen"],
    axes: [ax("load", "Load", { scale: "weight", values: ["5 kg", "7 kg", "8 kg", "10 kg", "12 kg"] }), ax("type", "Type", { values: ["Top load", "Front load", "Twin tub", "Washer dryer", "Dryer"] })],
    rows: [req(o("brand", "Brand")), req(c("condition", "Condition", ["New", "Used", "Refurbished"])), rec(t("energy", "Energy rating")), rec(t("warranty", "Warranty (months)")), rec(b("installation", "Delivery and installation"))],
    x: BRAND
  }),
  type("fan-heater-small-appliance", "Fans, heaters, kettles and blenders", {
    dept: "electronics", cats: ["electronics-appliances", "home-kitchen"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Standing fan", "Table fan", "Heater", "Electric kettle", "Blender", "Iron box", "Toaster", "Hair dryer", "Water heater", "Vacuum cleaner"] }), colour()],
    rows: [req(o("brand", "Brand")), req(t("power", "Power (W)")), rec(t("capacity", "Capacity")), rec(t("warranty", "Warranty (months)"))],
    x: { open: ["brand", "colour"] }
  }),
  // ---- Fashion extras -----------------------------------------------------------------------------------------------------
  type("school-uniform", "School uniform", {
    dept: "clothing", cats: ["tailor-boutique", "fashion-boutiques"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Shirt", "Skirt", "Trousers", "Sweater", "Tie", "Socks", "Blazer", "Games kit", "Dress"] }), ax("age", "Size", { scale: "kids-age", sizeChart: "kids" }), colour("School colour")],
    rows: [req(t("school", "School or crest")), req(c("gender", "For", ["Girls", "Boys", "Unisex"])), req(o("material", "Fabric")), rec(c("order", "Order", ["Ready-made", "Made to measure"])), rec(t("lead-time", "Days to make"))],
    x: { sizeChart: "kids", open: ["colour", "material"] }
  }),
  type("alterations-repairs", "Alterations and clothing repairs", {
    dept: "clothing", cats: ["tailor-boutique"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Hemming", "Take in", "Let out", "Zip replacement", "Patch", "Resize", "Button sewing", "Shorten sleeves", "Waist adjustment"] }), ax("garment", "Garment", { values: ["Trousers", "Dress", "Shirt", "Suit", "Skirt", "Curtain", "Other"] })],
    rows: [req(t("turnaround", "Ready in")), rec(b("express", "Express service")), rec(b("pickup", "Pickup and delivery")), rec(t("fitting", "Fitting appointment"))],
    x: {}
  }),
  type("suit-formalwear", "Suits and formalwear", {
    dept: "clothing", cats: ["tailor-boutique", "fashion-boutiques"],
    axes: [ax("piece", "Pieces", { values: ["Blazer", "2-piece suit", "3-piece suit", "Tuxedo", "Waistcoat", "Trousers"] }), ax("size", "Size", { scale: "apparel-numeric", sizeChart: "apparel" }), colour()],
    rows: [req(c("gender", "For", ["Men", "Women", "Boys"])), req(o("material", "Fabric")), rec(c("order", "Order", ["Ready-made", "Made to measure", "Hire"])), rec(c("occasion", "Occasion", ["Office", "Wedding", "Graduation", "Party"])), rec(t("lead-time", "Days to make"))],
    x: { sizeChart: "suit", open: ["colour", "material"] }
  }),
  type("traditional-bridal-wear", "Traditional and bridal wear", {
    dept: "clothing", cats: ["tailor-boutique", "fashion-boutiques"],
    axes: [ax("garment", "Garment", { values: ["Wedding gown", "Bridesmaid dress", "Kitenge outfit", "Kanzu", "Kaftan", "Dera", "Maasai shuka", "Ruracio outfit"] }), ax("size", "Size", { scale: "apparel-alpha", sizeChart: "apparel" }), colour()],
    rows: [req(c("order", "Order", ["Ready-made", "Made to measure", "Hire"])), req(o("material", "Fabric")), rec(t("lead-time", "Days to make")), rec(t("fitting", "Fittings included"))],
    x: { sizeChart: "apparel", open: ["colour", "material"] }
  }),
  type("underwear-socks", "Underwear, socks and sleepwear", {
    dept: "clothing", cats: ["fashion-boutiques", "tailor-boutique", "supermarket-minimart"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Bra", "Panties", "Boxers", "Vest", "Socks", "Tights", "Pyjamas", "Nightdress", "Thermal wear"] }), ax("size", "Size", { scale: "apparel-alpha", sizeChart: "bra" }), ax("pack", "Pack", { scale: "count", values: ["1", "3", "5", "6", "12"] })],
    rows: [req(c("gender", "For", ["Women", "Men", "Girls", "Boys", "Unisex"])), req(o("material", "Fabric")), rec(o("brand", "Brand")), rec(c("condition", "Condition", ["New", "Mitumba (used)"]))],
    x: { sizeChart: "bra", open: ["colour", "material", "brand"] }
  }),
  type("sportswear", "Sportswear and team kit", {
    dept: "clothing", cats: ["fashion-boutiques", "gym-fitness"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Jersey", "Shorts", "Tracksuit", "Leggings", "Sports bra", "Football boots", "Gloves", "Team kit set"] }), ax("size", "Size", { scale: "apparel-alpha", sizeChart: "apparel" }), colour()],
    rows: [req(c("gender", "For", ["Men", "Women", "Kids", "Unisex"])), req(o("material", "Fabric")), rec(o("brand", "Brand")), rec(c("condition", "Condition", ["New", "Mitumba (used)"])), rec(b("printing", "Name and number printing"))],
    x: { sizeChart: "apparel", open: ["colour", "material", "brand"] }
  }),
  // ---- Auto, motorbikes, transport ----------------------------------------------------------------------------------------
  type("tyre-fitting-alignment", "Tyre fitting, balancing and alignment", {
    dept: "auto-parts", cats: ["garage-mechanic", "auto-spare-parts", "car-wash"], kind: "service",
    axes: [ax("service", "Service", { values: ["Tyre fitting", "Wheel balancing", "Wheel alignment", "Puncture repair", "Tyre rotation", "Tyre rotation and balance", "Nitrogen inflation"] }), ax("vehicle", "Vehicle", { scale: "vehicle-class", values: ["Saloon", "SUV", "Pickup", "Van", "Truck", "Motorbike"] })],
    rows: [req(t("duration", "How long it takes")), rec(b("mobile", "Mobile service")), rec(b("emergency", "Emergency callout")), rec(t("warranty", "Warranty"))],
    x: {}
  }),
  type("bodywork-spraying", "Bodywork and spray painting", {
    dept: "auto-parts", cats: ["garage-mechanic"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Dent repair", "Panel beating", "Full respray", "Part respray", "Scratch removal", "Bumper repair", "Windscreen replacement", "Rust treatment"] }), ax("vehicle", "Vehicle", { scale: "vehicle-class", values: ["Saloon", "SUV", "Pickup", "Van", "Truck"] })],
    rows: [req(t("duration", "Days to complete")), req(c("quote", "Quote", ["Free quote", "Quote after inspection"])), rec(t("warranty", "Warranty on work")), rec(b("insurance", "Insurance jobs accepted"))],
    x: { priceRule: "per-job" }
  }),
  type("towing-recovery", "Towing and roadside assistance", {
    dept: "auto-parts", cats: ["garage-mechanic", "transport-logistics"], kind: "service",
    axes: [ax("service", "Service", { values: ["Towing", "Jump start", "Tyre change", "Fuel delivery", "Lockout", "Accident recovery", "Mobile mechanic"] }), ax("vehicle", "Vehicle", { scale: "vehicle-class", values: ["Saloon", "SUV", "Pickup", "Van", "Truck", "Motorbike"] })],
    rows: [req(b("open-24h", "Available 24 hours")), req(t("area", "Area covered")), rec(c("price", "Price", ["Per job", "Per km"])), rec(t("response-time", "Typical response time"))],
    x: {}
  }),
  type("used-spare-part", "Used and ex-Japan spare part", {
    dept: "auto-parts", cats: ["auto-spare-parts"],
    axes: [ax("part", "Part", { display: "text-card", values: ["Engine", "Gearbox", "Headlight", "Door", "Bumper", "Mirror", "Alloy rim", "ECU", "Radiator", "Seat"] })],
    rows: [req(t("make", "Vehicle make")), req(t("model", "Vehicle model")), req(t("year", "Years it fits")), req(c("condition", "Condition", ["Used - good", "Used - fair", "Ex-Japan", "Refurbished"])), rec(t("part-number", "Part number")), rec(t("warranty", "Warranty"))],
    x: { compat: { list: "vehicles", mode: "multi" } }
  }),
  type("car-accessories-care", "Car accessories and care products", {
    dept: "auto-parts", cats: ["auto-spare-parts", "car-wash"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Seat cover", "Floor mat", "Car perfume", "Phone holder", "Dash cam", "Reverse camera", "Car stereo", "Wax and polish", "Shampoo", "Jump leads", "Car vacuum"] }), colour()],
    rows: [req(o("brand", "Brand")), rec(t("fits", "Fits (make and model)")), rec(t("size", "Size or volume")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand", "colour"] }
  }),
  type("car-detailing", "Car detailing and polishing", {
    dept: "auto-parts", cats: ["car-wash"], kind: "service",
    axes: [ax("package", "Package", { values: ["Basic wash", "Full wash", "Interior detail", "Exterior detail", "Full detail", "Engine wash", "Wax and polish", "Ceramic coating", "Headlight restoration"] }), ax("vehicle", "Vehicle", { scale: "vehicle-class", values: ["Saloon", "SUV", "Van", "Truck", "Bike"] })],
    rows: [req(t("duration", "How long it takes")), rec(b("pickup", "Pickup service")), rec(b("waiting-area", "Waiting area")), rec(t("membership", "Membership option"))],
    x: { priceGrid: ["package", "vehicle"] }
  }),
  type("motorbike-sale", "Motorbike for sale", {
    dept: "auto-parts", cats: ["motorbike-sales-parts"],
    axes: [ax("engine", "Engine", { values: ["100 cc", "125 cc", "150 cc", "180 cc", "200 cc and above"] }), colour()],
    rows: [req(o("brand", "Make")), req(t("model", "Model")), req(t("year", "Year")), req(c("condition", "Condition", ["New", "Used", "Ex-Japan"])), rec(t("mileage", "Mileage (km)")), rec(c("use", "Use", ["Boda boda", "Personal", "Delivery", "Off-road"])), rec(b("logbook", "Logbook available")), rec(b("financing", "Financing available"))],
    x: { open: ["brand", "colour"] }
  }),
  type("motorbike-parts-gear", "Motorbike parts, helmets and gear", {
    dept: "auto-parts", cats: ["motorbike-sales-parts"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Helmet", "Tyre", "Chain and sprocket", "Brake pads", "Battery", "Engine oil", "Reflector jacket", "Gloves", "Side mirror", "Phone holder", "Carrier box"] }), ax("size", "Size", { values: ["S", "M", "L", "XL", "Universal"] })],
    rows: [req(o("brand", "Brand")), req(t("fits", "Fits (make and model)")), rec(c("condition", "Condition", ["New", "Used", "Ex-Japan"])), rec(t("warranty", "Warranty")), rec(t("certification", "Safety mark (helmets)"))],
    x: { open: ["brand"], sizeChart: "helmet" }
  }),
  type("passenger-ride", "Passenger transport (boda, taxi, shuttle)", {
    dept: "auto-parts", cats: ["transport-logistics"], kind: "service",
    axes: [ax("vehicle", "Vehicle", { values: ["Boda boda", "Tuk tuk", "Taxi", "Minibus", "Matatu hire", "Bus hire", "Airport shuttle"] }), ax("trip", "Trip", { values: ["Town ride", "Airport transfer", "Intercity", "Hourly hire", "School run", "Event shuttle"] })],
    rows: [req(c("booking", "Booking", ["On demand", "Scheduled", "Both"])), req(t("seats", "Seats")), rec(c("price", "Price", ["Per km", "Per trip", "Per hour", "Per day"])), rec(b("licensed", "Licensed and insured")), rec(t("area", "Area covered"))],
    x: {}
  }),
  type("parcel-delivery-moving", "Parcels, deliveries and moving", {
    dept: "auto-parts", cats: ["transport-logistics"], kind: "service",
    axes: [ax("service", "Service", { values: ["Parcel delivery", "Errand", "House moving", "Office moving", "Goods haulage", "Courier", "Furniture delivery", "Cold-chain delivery"] }), ax("vehicle", "Vehicle", { values: ["Boda boda", "Pickup", "Van", "Lorry", "Truck"] }), ax("capacity", "Capacity", { values: ["Up to 20 kg", "Up to 500 kg", "1 tonne", "3 tonnes", "7 tonnes and above"] })],
    rows: [req(c("price", "Price", ["Per km", "Per trip", "Per hour", "Per parcel"])), req(t("area", "Area covered")), rec(b("loaders", "Loaders included")), rec(b("tracking", "Tracking")), rec(b("insurance", "Goods in transit insured"))],
    x: {}
  }),
  type("vehicle-hire", "Vehicle hire (self-drive and with driver)", {
    dept: "auto-parts", cats: ["transport-logistics", "event-hire"], kind: "service",
    axes: [ax("vehicle", "Vehicle", { scale: "vehicle-class", values: ["Saloon", "SUV", "Van", "Pickup", "Minibus", "Bus", "Truck"] }), ax("period", "Period", { values: ["Hour", "Day", "Week", "Month"] })],
    rows: [req(c("driver", "Driver", ["With driver", "Self-drive", "Either"])), req(t("deposit", "Deposit")), rec(t("mileage", "Mileage limit")), rec(b("insured", "Insured")), rec(t("fuel", "Fuel policy"))],
    x: { priceRule: "per-duration" }
  }),
  // ---- Events and hire ----------------------------------------------------------------------------------------------------
  type("event-hire-furniture", "Tents, chairs and tables for hire", {
    dept: "photography-events", cats: ["event-hire", "photography-events"], kind: "service",
    axes: [ax("item", "Item", { display: "text-card", values: ["Tent", "Chairs", "Tables", "Table cloths", "Cooler", "Stage", "Dance floor", "Red carpet", "Cutlery and crockery", "Bouncing castle"] }), ax("qty", "Quantity", { scale: "count", values: ["10", "50", "100", "200", "500"] })],
    rows: [req(c("price", "Price is per", ["Item per day", "Set per day", "Per event"])), req(b("delivery", "Delivery and setup")), rec(t("deposit", "Deposit")), rec(t("tent-size", "Tent size or seats")), rec(b("collection", "Collection after event"))],
    x: { priceRule: "per-duration" }
  }),
  type("event-hire-sound-lighting", "Sound, lighting and entertainment hire", {
    dept: "photography-events", cats: ["event-hire", "photography-events"], kind: "service",
    axes: [ax("item", "Item", { display: "text-card", values: ["PA system", "DJ and music", "MC", "Live band", "Stage lights", "LED screen", "Projector", "Generator", "Photo booth", "Karaoke"] }), ax("crowd", "Crowd size", { values: ["Up to 50", "Up to 200", "Up to 500", "500 and above"] })],
    rows: [req(c("price", "Price is per", ["Hour", "Event", "Day"])), req(b("operator", "Operator or DJ included")), rec(b("setup", "Setup and teardown included")), rec(b("travel", "Travels to the venue"))],
    x: { priceRule: "per-duration" }
  }),
  type("event-decor-planning", "Decor and event planning", {
    dept: "photography-events", cats: ["event-hire", "photography-events"], kind: "package",
    axes: [ax("event", "Event", { values: ["Wedding", "Birthday", "Baby shower", "Corporate", "Graduation", "Funeral", "Church"] }), ax("package", "Package", { values: ["Decor only", "Planning only", "Decor and planning", "Full coordination"] })],
    rows: [req(t("includes", "What is included")), req(t("lead-time", "Book at least this long before")), rec(t("guests", "Guests it suits")), rec(t("deposit", "Deposit")), rec(b("travel", "Travels"))],
    x: {}
  }),
  type("drone-video-service", "Drone and video coverage", {
    dept: "photography-events", cats: ["photography-events"], kind: "service",
    axes: [ax("coverage", "Coverage", { values: ["Photo only", "Video only", "Photo and video", "Drone only", "Live stream"] }), ax("hours", "Hours", { scale: "duration", values: ["2 h", "4 h", "8 h", "12 h"] })],
    rows: [req(t("deliverables", "Deliverables")), req(t("delivery-time", "Delivery time")), rec(b("drone", "Drone included")), rec(t("licence", "Drone licence (KCAA)")), rec(b("travel", "Travels"))],
    x: {}
  })
];
