// Catalogue coverage, part 1: food, drink, farm, poultry, fish, bars and pets.
// Each type is what a seller picks when listing; its axes are the choices a buyer makes (and the filters that follow), its spec rows
// the facts a buyer compares. At most 3 axes and 4 required rows per type (validateProductType). New types only: nothing here
// replaces a type that already exists.
import { ax, b, c, colour, n, o, rec, req, t, tiers, type } from "./lib.mjs";

const BRAND = { open: ["brand"] };
const FRESH = c("freshness", "Fresh or frozen", ["Fresh", "Chilled", "Frozen"]);

export const COVERAGE_FOOD = [
  // ---- Water and gas ------------------------------------------------------------------------------------------------------
  type("water-dispenser-filter", "Water dispenser and filter", {
    dept: "water-energy", cats: ["water-refill", "home-kitchen", "electronics-appliances"],
    axes: [ax("kind", "Kind", { display: "text-card", values: ["Hot and cold dispenser", "Table-top dispenser", "Bottom-load dispenser", "Filter jug", "Tap filter", "Filter cartridge"] }), colour()],
    rows: [req(o("brand", "Brand")), rec(c("power", "Power", ["Electric", "Manual", "Not needed"])), rec(t("warranty", "Warranty")), rec(t("fits-bottle", "Fits bottle size")), rec(b("installation", "Installation offered"))],
    x: BRAND
  }),
  type("lpg-accessories", "Gas stove, regulator and hose", {
    dept: "water-energy", cats: ["lpg-gas", "home-kitchen", "hardware-building"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Single burner stove", "Double burner stove", "Table-top cooker", "Regulator", "Gas hose", "Grill", "Cylinder trolley"] }), ax("fits", "Fits cylinder", { values: ["3 kg", "6 kg", "13 kg", "22.5 kg", "Any"] })],
    rows: [req(o("brand", "Brand")), rec(t("burners", "Burners")), rec(t("standards-mark", "Standards mark")), rec(b("installation", "Installation offered")), rec(t("warranty", "Warranty"))],
    x: BRAND
  }),
  // ---- Bakery and snacks --------------------------------------------------------------------------------------------------
  type("buns-doughnuts-snacks", "Buns, doughnuts, mandazi and samosas", {
    dept: "food-drink", cats: ["bakery", "restaurant-cafe", "supermarket-minimart"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Mandazi", "Doughnut", "Bun", "Samosa", "Meat pie", "Sausage roll", "Chapati", "Scone"] }), ax("pack", "Pack of", { scale: "count", values: ["1", "3", "6", "12", "24"] }), ax("filling", "Filling", { values: ["Beef", "Chicken", "Vegetable", "Cream", "Jam", "Plain"] })],
    rows: [req(t("ingredients", "Ingredients")), req(t("allergens", "Allergens")), rec(c("served", "Served", ["Hot", "Cold", "Packed to take away"])), rec(t("ready-from", "Ready from")), rec(b("fresh-today", "Baked fresh today"))],
    x: { open: ["flavour"] }
  }),
  type("custom-cake-order", "Custom cake (made to order)", {
    dept: "food-drink", cats: ["bakery"],
    axes: [ax("weight", "Weight", { scale: "weight", values: ["1 kg", "2 kg", "3 kg", "5 kg", "10 kg"] }), ax("tiers", "Tiers", { scale: "count", values: ["1", "2", "3", "4"] }), ax("flavour", "Flavour", { open: "flavour", values: ["Vanilla", "Chocolate", "Red velvet", "Black forest", "Fruit", "Marble"] })],
    rows: [req(c("occasion", "Occasion", ["Birthday", "Wedding", "Graduation", "Baby shower", "Anniversary", "Corporate", "Other"])), req(t("allergens", "Allergens")), req(t("lead-time", "Order at least this long before")), rec(c("diet", "Dietary", ["Standard", "Eggless", "Sugar-free", "Gluten-free", "Vegan"]))],
    x: { open: ["flavour"], priceGrid: ["weight", "flavour"] }
  }),
  type("bakery-bulk-order", "Bulk and event baking", {
    dept: "food-drink", cats: ["bakery", "restaurant-cafe"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Bread", "Buns", "Cupcakes", "Mandazi", "Samosas", "Cookies", "Mixed platter"] }), ax("qty", "Quantity", { scale: "count", values: ["50", "100", "200", "500"] })],
    rows: [req(t("lead-time", "Order at least this long before")), req(t("allergens", "Allergens")), rec(b("delivery", "Delivery offered")), rec(t("minimum-order", "Minimum order"))],
    x: { priceRule: "quantity-packs", packs: [50, 100, 200, 500] }
  }),
  // ---- Juice shop ---------------------------------------------------------------------------------------------------------
  type("smoothie-fruit-salad", "Smoothie and fruit salad", {
    dept: "food-drink", cats: ["juice-shop", "restaurant-cafe"],
    axes: [ax("kind", "Kind", { values: ["Smoothie", "Fruit salad", "Yoghurt parfait", "Fresh coconut"] }), ax("cup", "Size", { scale: "volume", values: ["300 ml", "500 ml", "1 L"] }), ax("flavour", "Fruit or flavour", { open: "flavour", values: ["Mango", "Banana", "Passion", "Strawberry", "Mixed fruit", "Avocado"] })],
    rows: [req(t("ingredients", "Ingredients")), rec(c("sugar", "Sugar", ["No added sugar", "Lightly sweetened", "Sweet"])), rec(b("dairy-free", "Dairy-free")), rec(t("add-ons", "Add-ons (ginger, chia, honey)")), rec(t("allergens", "Allergens"))],
    x: { open: ["flavour"] }
  }),
  type("bottled-juice-event", "Bottled and bulk juice", {
    dept: "food-drink", cats: ["juice-shop", "supermarket-minimart"],
    axes: [ax("bottle", "Bottle size", { scale: "volume", values: ["300 ml", "500 ml", "1 L", "2 L", "5 L"] }), ax("flavour", "Flavour", { open: "flavour" })],
    rows: [req(t("ingredients", "Ingredients")), rec(t("shelf-life", "Shelf life")), rec(b("bulk", "Bulk or event orders")), rec(t("minimum-order", "Minimum order"))],
    x: { open: ["flavour"], priceRule: "quantity-packs", packs: [6, 12, 24] }
  }),
  // ---- Restaurant ---------------------------------------------------------------------------------------------------------
  type("restaurant-drink", "Hot and cold drinks (cafe)", {
    dept: "food-drink", cats: ["restaurant-cafe"],
    axes: [ax("drink", "Drink", { display: "text-card", values: ["Tea", "Coffee", "Latte", "Cappuccino", "Milkshake", "Soda", "Fresh juice", "Water"] }), ax("size", "Size", { values: ["Small", "Regular", "Large"] })],
    rows: [rec(c("served", "Served", ["Hot", "Cold", "Either"])), rec(t("ingredients", "Ingredients")), rec(b("dairy-free", "Dairy-free option")), rec(t("allergens", "Allergens"))]
  }),
  type("catering", "Catering and event food", {
    dept: "food-drink", cats: ["restaurant-cafe", "bakery", "photography-events"], kind: "service",
    axes: [ax("event", "Event", { values: ["Wedding", "Funeral", "Corporate", "Birthday", "School", "Church", "Party"] }), ax("guests", "Guests", { scale: "count", values: ["20", "50", "100", "200", "500"] }), ax("menu", "Menu", { values: ["Kenyan", "Continental", "Indian", "Chinese", "BBQ", "Buffet"] })],
    rows: [req(t("includes", "What is included")), req(t("lead-time", "Book at least this long before")), rec(b("halal", "Halal")), rec(b("service-staff", "Serving staff included")), rec(b("travel", "Travels to the venue"))],
    x: { priceRule: "per-guest" }
  }),
  // ---- Butchery and poultry -----------------------------------------------------------------------------------------------
  type("processed-meat", "Sausages and processed meat", {
    dept: "food-drink", cats: ["butchery", "supermarket-minimart"], qty: "measure",
    axes: [ax("item", "Item", { display: "text-card", values: ["Beef sausages", "Pork sausages", "Smokies", "Bacon", "Ham", "Marinated meat", "Smoked meat", "Biltong"] }), ax("pack", "Pack", { scale: "weight", values: ["250 g", "500 g", "1 kg"] })],
    rows: [req(c("meat-type", "Meat type", ["Beef", "Pork", "Chicken", "Goat", "Mixed"])), req(t("ingredients", "Ingredients")), rec(b("halal", "Halal")), rec(FRESH), rec(t("shelf-life", "Shelf life"))],
    x: { measureUnit: "kg" }
  }),
  type("offal-bones", "Offal and bones", {
    dept: "food-drink", cats: ["butchery"], qty: "measure",
    axes: [ax("item", "Item", { display: "text-card", values: ["Liver", "Matumbo", "Tripe", "Kidney", "Heart", "Tongue", "Bones", "Head and legs"] })],
    rows: [req(c("meat-type", "Meat type", ["Beef", "Goat", "Pork", "Chicken"])), rec(b("halal", "Halal")), rec(FRESH), rec(t("packed-on", "Packed on"))],
    x: { measureUnit: "kg" }
  }),
  type("dressed-chicken", "Chicken (dressed or live)", {
    dept: "food-drink", cats: ["butchery", "poultry-shop", "supermarket-minimart"],
    axes: [ax("bird", "Bird", { values: ["Broiler", "Kienyeji", "Layer (spent)", "Turkey", "Duck", "Quail"] }), ax("state", "State", { values: ["Live", "Dressed whole", "Cut into pieces", "Fillet"] }), ax("size", "Weight", { scale: "weight", values: ["1 kg", "1.5 kg", "2 kg", "3 kg"] })],
    rows: [req(c("price-by", "Priced", ["Per bird", "Per kg"])), rec(b("halal", "Halal")), rec(FRESH), rec(t("ready-from", "Ready from"))],
    x: { priceGrid: ["bird", "state"] }
  }),
  type("eggs", "Eggs", {
    dept: "food-drink", cats: ["poultry-shop", "supermarket-minimart", "greengrocer", "butchery"],
    axes: [ax("pack", "Pack", { values: ["6 eggs", "Half tray (15)", "Tray of 30", "Crate of 12 trays"] }), ax("bird", "Source", { values: ["Kienyeji", "Layers", "Quail", "Duck"] }), ax("size", "Egg size", { values: ["Small", "Medium", "Large", "Extra large"] })],
    rows: [req(t("collected", "Collected or laid")), rec(c("storage", "Storage", ["Fresh", "Refrigerated"])), rec(b("delivery", "Delivery offered")), rec(t("minimum-order", "Minimum order"))],
    x: { priceRule: "quantity-packs" }
  }),
  // ---- Fish and mama mboga ------------------------------------------------------------------------------------------------
  type("fish", "Fish", {
    dept: "food-drink", cats: ["fish-mama-mboga", "butchery", "supermarket-minimart"], qty: "measure",
    axes: [ax("fish", "Fish", { display: "text-card", open: "kind", values: ["Tilapia", "Nile perch", "Omena", "Catfish", "Mud fish", "Tuna", "Sardines", "Prawns"] }), ax("prep", "Prepared", { values: ["Whole", "Gutted", "Filleted", "Fried", "Dried", "Smoked"] })],
    rows: [req(c("price-by", "Priced", ["Per kg", "Per fish", "Per heap"])), req(c("source", "Source", ["Lake", "Ocean", "Farmed", "Imported"])), rec(FRESH), rec(t("caught-on", "Caught or delivered on"))],
    x: { measureUnit: "kg" }
  }),
  type("mama-mboga-produce", "Vegetables, fruit and staples (mama mboga)", {
    dept: "food-drink", cats: ["fish-mama-mboga", "greengrocer"], qty: "measure",
    axes: [ax("item", "Item", { display: "text-card", open: "kind", values: ["Sukuma wiki", "Spinach", "Cabbage", "Tomatoes", "Onions", "Potatoes", "Bananas", "Arrowroots", "Beans", "Githeri"] }), ax("sold_by", "Sold by", { values: ["kg", "Bunch", "Heap", "Piece", "Sack", "Crate"] })],
    rows: [req(c("origin", "Origin", ["Local", "Imported"])), rec(b("organic", "Organic")), rec(b("fresh-today", "Fresh today")), rec(b("bulk", "Bulk or wholesale")), rec(t("grade", "Grade"))],
    x: { measureUnit: "kg", unitsAllowed: true }
  }),
  type("herbs-spices", "Herbs, spices and seasoning", {
    dept: "food-drink", cats: ["greengrocer", "supermarket-minimart", "fish-mama-mboga"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Coriander", "Ginger", "Garlic", "Chilli", "Curry powder", "Pilau masala", "Turmeric", "Cardamom", "Cinnamon", "Black pepper"] }), ax("pack", "Pack", { scale: "weight", values: ["50 g", "100 g", "250 g", "500 g"] })],
    rows: [req(c("form", "Form", ["Fresh", "Dried", "Ground", "Whole"])), rec(t("origin", "Origin")), rec(t("best-before", "Best before")), rec(b("organic", "Organic"))],
    x: BRAND
  }),
  // ---- Supermarket and groceries ------------------------------------------------------------------------------------------
  type("cooking-oil-fat", "Cooking oil and fat", {
    dept: "food-drink", cats: ["supermarket-minimart", "posho-mill-cereals"],
    axes: [ax("size", "Size", { scale: "volume", values: ["250 ml", "500 ml", "1 L", "2 L", "3 L", "5 L", "10 L", "20 L"] }), ax("kind", "Kind", { values: ["Vegetable oil", "Sunflower oil", "Corn oil", "Olive oil", "Cooking fat", "Margarine"] })],
    rows: [req(o("brand", "Brand")), rec(t("best-before", "Best before")), rec(t("origin", "Origin")), rec(b("wholesale", "Wholesale price available"))],
    x: BRAND
  }),
  type("flour-cereals-rice", "Flour, maize meal, rice and cereals", {
    dept: "food-drink", cats: ["supermarket-minimart", "posho-mill-cereals"],
    axes: [ax("pack", "Pack", { scale: "weight", values: ["500 g", "1 kg", "2 kg", "5 kg", "10 kg", "25 kg", "50 kg", "90 kg"] }), ax("kind", "Kind", { display: "text-card", values: ["Maize flour (unga)", "Wheat flour", "Rice", "Millet flour", "Sorghum flour", "Porridge flour", "Beans", "Green grams", "Lentils", "Oats"] })],
    rows: [req(o("brand", "Brand")), rec(c("grade", "Grade", ["Sifted", "Unsifted", "Whole grain", "Fortified"])), rec(t("origin", "Origin")), rec(t("best-before", "Best before")), rec(b("wholesale", "Wholesale price available"))],
    x: { ...BRAND, priceRule: "quantity-packs" }
  }),
  type("tea-coffee-sugar", "Tea, coffee, sugar and spreads", {
    dept: "food-drink", cats: ["supermarket-minimart"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Tea leaves", "Tea bags", "Instant coffee", "Ground coffee", "Sugar", "Honey", "Jam", "Peanut butter", "Salt", "Cocoa"] }), ax("pack", "Pack", { scale: "weight", values: ["50 g", "100 g", "250 g", "500 g", "1 kg", "2 kg"] })],
    rows: [req(o("brand", "Brand")), rec(t("origin", "Origin")), rec(t("best-before", "Best before")), rec(b("sugar-free", "Sugar-free"))],
    x: BRAND
  }),
  type("dairy-eggs-chilled", "Milk, yoghurt and dairy", {
    dept: "food-drink", cats: ["supermarket-minimart", "juice-shop"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Fresh milk", "Long life milk", "Yoghurt", "Mala", "Butter", "Cheese", "Cream", "Ghee"] }), ax("size", "Size", { scale: "volume", values: ["200 ml", "250 ml", "500 ml", "1 L"] }), ax("flavour", "Flavour", { open: "flavour", values: ["Plain", "Vanilla", "Strawberry", "Banana"] })],
    rows: [req(o("brand", "Brand")), req(c("storage", "Storage", ["Refrigerate", "Room temperature until opened"])), rec(t("best-before", "Best before")), rec(b("lactose-free", "Lactose-free"))],
    x: { ...BRAND, open: ["brand", "flavour"] }
  }),
  type("snacks-biscuits-sweets", "Snacks, biscuits and sweets", {
    dept: "food-drink", cats: ["supermarket-minimart"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Biscuits", "Crisps", "Chocolate", "Sweets", "Chewing gum", "Popcorn", "Nuts", "Cereal bar"] }), ax("pack", "Pack", { values: ["Single", "Pack of 6", "Pack of 12", "Box of 24"] }), ax("flavour", "Flavour", { open: "flavour" })],
    rows: [req(o("brand", "Brand")), rec(t("allergens", "Allergens")), rec(t("best-before", "Best before")), rec(b("halal", "Halal"))],
    x: { open: ["brand", "flavour"] }
  }),
  type("soft-drinks-bottled-water", "Soda, energy drinks and bottled water", {
    dept: "food-drink", cats: ["supermarket-minimart", "restaurant-cafe"],
    axes: [ax("size", "Bottle", { scale: "volume", values: ["300 ml", "350 ml", "500 ml", "750 ml", "1 L", "1.5 L", "2 L"] }), ax("pack", "Pack", { values: ["Single", "6 pack", "12 pack", "Crate of 24"] }), ax("flavour", "Flavour", { open: "flavour" })],
    rows: [req(o("brand", "Brand")), rec(c("type", "Type", ["Soda", "Energy drink", "Still water", "Sparkling water", "Sports drink"])), rec(b("sugar-free", "Sugar-free")), rec(t("best-before", "Best before"))],
    x: { open: ["brand", "flavour"], priceRule: "quantity-packs" }
  }),
  type("household-consumables", "Cleaning and household consumables", {
    dept: "food-drink", cats: ["supermarket-minimart", "cleaning-laundry"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Washing powder", "Dish soap", "Bar soap", "Toilet paper", "Bleach", "Disinfectant", "Air freshener", "Insecticide", "Matches", "Candles"] }), ax("size", "Size", { values: ["Small", "Medium", "Large", "Bulk"] })],
    rows: [req(o("brand", "Brand")), rec(t("pack-size", "Pack size (g, ml or rolls)")), rec(t("scent", "Scent")), rec(b("wholesale", "Wholesale price available"))],
    x: BRAND
  }),
  type("baby-food-formula", "Baby food and formula", {
    dept: "food-drink", cats: ["supermarket-minimart", "baby-shop", "chemist"],
    axes: [ax("pack", "Pack", { scale: "weight", values: ["200 g", "400 g", "800 g", "900 g"] }), ax("stage", "Stage", { values: ["0 to 6 months", "6 to 12 months", "1 to 3 years", "Toddler"] })],
    rows: [req(o("brand", "Brand")), req(t("best-before", "Best before")), rec(t("ingredients", "Ingredients")), rec(t("allergens", "Allergens"))],
    x: BRAND
  }),
  // ---- Posho mill ---------------------------------------------------------------------------------------------------------
  type("milling-service", "Milling service (posho mill)", {
    dept: "food-drink", cats: ["posho-mill-cereals"], kind: "service", qty: "measure",
    axes: [ax("grain", "Grain", { values: ["Maize", "Sorghum", "Millet", "Wheat", "Cassava", "Mixed"] }), ax("finish", "Flour", { values: ["Fine", "Coarse", "Sifted", "Whole meal"] })],
    rows: [req(c("price-by", "Priced", ["Per kg", "Per debe (tin)", "Per sack"])), rec(t("turnaround", "Ready in")), rec(b("pickup", "Pickup from home")), rec(b("sifting", "Sifting included"))],
    x: { measureUnit: "kg" }
  }),
  // ---- Bar and wines ------------------------------------------------------------------------------------------------------
  type("beer-cider", "Beer and cider", {
    dept: "food-drink", cats: ["wines-spirits-bar", "supermarket-minimart"],
    axes: [ax("volume", "Bottle or can", { scale: "volume", values: ["330 ml", "375 ml", "440 ml", "500 ml", "750 ml"] }), ax("pack", "Pack", { values: ["Single", "6 pack", "Crate of 24"] }), ax("serve", "Served", { values: ["Cold", "Warm"] })],
    rows: [req(o("brand", "Brand")), req(c("type", "Type", ["Lager", "Stout", "Ale", "Cider", "Alcohol-free"])), req(n("abv", "Alcohol (% ABV)")), rec(c("sold", "Sold", ["Retail to take away", "Bar (drink in)"]))],
    x: BRAND
  }),
  type("wine", "Wine and champagne", {
    dept: "food-drink", cats: ["wines-spirits-bar", "supermarket-minimart"],
    axes: [ax("volume", "Bottle", { scale: "volume", values: ["187 ml", "375 ml", "750 ml", "1.5 L", "3 L"] }), ax("style", "Style", { values: ["Red", "White", "Rose", "Sparkling", "Fortified"] }), ax("sweetness", "Sweetness", { values: ["Dry", "Semi-dry", "Semi-sweet", "Sweet"] })],
    rows: [req(o("brand", "Brand")), req(t("origin", "Country or region")), req(n("abv", "Alcohol (% ABV)")), rec(t("vintage", "Vintage (year)")), rec(t("grape", "Grape"))],
    x: BRAND
  }),
  type("spirits", "Whisky, vodka, gin and other spirits", {
    dept: "food-drink", cats: ["wines-spirits-bar", "supermarket-minimart"],
    axes: [ax("volume", "Bottle", { scale: "volume", values: ["200 ml", "250 ml", "375 ml", "500 ml", "750 ml", "1 L", "1.75 L"] }), ax("kind", "Spirit", { values: ["Whisky", "Vodka", "Gin", "Rum", "Brandy", "Cognac", "Tequila", "Liqueur", "Local spirit"] })],
    rows: [req(o("brand", "Brand")), req({ key: "authenticity", label: "Authenticity", input: "choice", labelSet: "authenticity" }), req(n("abv", "Alcohol (% ABV)")), rec(t("age", "Age (years)")), rec(b("gift-box", "Gift box"))],
    x: BRAND
  }),
  type("bar-menu-drink", "Bar drink served (per tot or glass)", {
    dept: "food-drink", cats: ["wines-spirits-bar", "restaurant-cafe"],
    axes: [ax("serve", "Served as", { values: ["Bottle", "Glass", "Tot", "Double", "Jug", "Bucket"] }), ax("temp", "Temperature", { values: ["Cold", "Warm", "On the rocks"] })],
    rows: [req(o("brand", "Brand")), rec(n("abv", "Alcohol (% ABV)")), rec(t("happy-hour", "Happy hour offer"))],
    x: BRAND
  }),
  // ---- Agrovet and farm ---------------------------------------------------------------------------------------------------
  type("animal-feed", "Animal feed", {
    dept: "farm-inputs", cats: ["agrovet", "poultry-shop"],
    axes: [ax("animal", "Animal", { values: ["Dairy cow", "Beef cattle", "Calf", "Layers", "Broilers", "Chicks", "Pigs", "Goats and sheep", "Rabbits", "Fish", "Dogs", "Horses"] }), ax("pack", "Bag", { scale: "weight", values: ["5 kg", "10 kg", "20 kg", "25 kg", "50 kg", "70 kg"] }), ax("form", "Form", { values: ["Mash", "Pellets", "Crumbs", "Meal", "Cubes", "Lick"] })],
    rows: [req(o("brand", "Brand")), req(t("stage", "Stage (starter, grower, layer ...)")), rec(n("protein", "Protein (%)")), rec(t("manufacture-date", "Manufacture date")), rec(t("analysis", "Feed analysis"))],
    x: BRAND
  }),
  type("seeds-seedlings", "Seeds and seedlings", {
    dept: "farm-inputs", cats: ["agrovet"],
    axes: [ax("crop", "Crop", { display: "text-card", values: ["Maize", "Beans", "Tomato", "Kale (sukuma)", "Cabbage", "Onion", "Spinach", "Sorghum", "Potato", "Grass (Napier)", "Tree seedlings"] }), ax("pack", "Pack", { values: ["10 g", "50 g", "100 g", "250 g", "1 kg", "2 kg", "10 kg", "Seedling"] }), ax("variety", "Variety", { open: "kind" })],
    rows: [req(o("brand", "Brand or seed company")), req(c("type", "Type", ["Hybrid", "Open pollinated", "Certified", "Seedling", "Grafted"])), rec(t("maturity", "Days to maturity")), rec(t("altitude", "Suited altitude")), rec(t("germination", "Germination (%)"))],
    x: BRAND
  }),
  type("fertiliser-manure", "Fertiliser and manure", {
    dept: "farm-inputs", cats: ["agrovet"],
    axes: [ax("kind", "Kind", { values: ["DAP", "CAN", "NPK", "Urea", "MOP", "Foliar", "Organic manure", "Compost", "Lime"] }), ax("pack", "Bag", { scale: "weight", values: ["1 kg", "2 kg", "10 kg", "25 kg", "50 kg"] })],
    rows: [req(o("brand", "Brand")), req(t("npk", "Nutrient content (N-P-K)")), req(c("use", "Best for", ["Planting", "Top dressing", "Foliar feeding", "Soil correction"])), rec(t("best-before", "Best before"))],
    x: BRAND
  }),
  type("farm-tools-equipment", "Farm tools and equipment", {
    dept: "farm-inputs", cats: ["agrovet", "hardware-building"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Knapsack sprayer", "Water pump", "Drip kit", "Jembe", "Panga", "Wheelbarrow", "Milk can", "Feeder", "Drinker", "Brooder", "Incubator", "Fencing wire"] }), ax("size", "Size or capacity", { values: ["Small", "Medium", "Large"] })],
    rows: [req(o("brand", "Brand")), req(t("capacity", "Capacity or size")), rec(t("power", "Power source")), rec(t("warranty", "Warranty")), rec(b("delivery", "Delivery offered"))],
    x: BRAND
  }),
  type("agrovet-service", "Vet and farm services", {
    dept: "farm-inputs", cats: ["agrovet", "pet-shop-vet"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Vaccination", "Deworming", "AI (artificial insemination)", "Treatment", "Pregnancy check", "Farm visit", "Soil test", "Spraying"] }), ax("animal", "Animal", { values: ["Cattle", "Goats and sheep", "Pigs", "Poultry", "Dogs", "Cats", "Other"] })],
    rows: [req(t("qualification", "Qualification or licence")), req(b("farm-visit", "Farm visit")), rec(t("travel", "Travel cost")), rec(b("emergency", "Emergency callout")), rec(t("area", "Area covered"))],
    x: { priceRule: "per-visit" }
  }),
  // ---- Poultry shop -------------------------------------------------------------------------------------------------------
  type("day-old-chicks", "Day-old and growing chicks", {
    dept: "farm-inputs", cats: ["poultry-shop", "agrovet"],
    axes: [ax("breed", "Breed", { open: "kind", values: ["Kenbro", "Kuroiler", "Rainbow Rooster", "Cobb 500", "Ross 308", "Isa Brown", "Sasso", "Improved kienyeji"] }), ax("age", "Age", { values: ["Day-old", "1 week", "2 weeks", "4 weeks", "8 weeks"] }), ax("qty", "Quantity", { scale: "count", values: ["10", "50", "100", "500", "1000"] })],
    rows: [req(t("purpose", "Purpose (meat, eggs, dual)")), req(b("vaccinated", "Vaccinated")), rec(t("hatch-date", "Hatch date")), rec(t("supplier", "Hatchery")), rec(b("delivery", "Delivery offered"))],
    x: { priceRule: "quantity-packs", packs: [10, 50, 100, 500, 1000] }
  }),
  type("live-birds", "Live birds (layers, kienyeji, turkeys)", {
    dept: "farm-inputs", cats: ["poultry-shop"],
    axes: [ax("bird", "Bird", { values: ["Layer", "Broiler", "Kienyeji", "Turkey", "Duck", "Goose", "Quail", "Guinea fowl"] }), ax("age", "Age", { values: ["Point of lay", "Young", "Mature"] }), ax("qty", "Quantity", { values: ["Single", "10 and more", "100 and more"] })],
    rows: [req(t("weight", "Weight range")), req(t("breed", "Breed")), req(b("vaccinated", "Vaccinated")), rec(b("delivery", "Delivery offered"))],
    x: { priceRule: "quantity-packs" }
  }),
  type("poultry-equipment", "Poultry equipment", {
    dept: "farm-inputs", cats: ["poultry-shop", "agrovet"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Brooder", "Feeder", "Drinker", "Egg tray", "Incubator", "Cage", "Heat lamp", "Nest box"] }), ax("size", "Size", { values: ["Small", "Medium", "Large"] })],
    rows: [req(t("capacity", "Capacity")), rec(o("brand", "Brand")), rec(t("power", "Power source")), rec(t("warranty", "Warranty"))],
    x: BRAND
  }),
  // ---- Pets ---------------------------------------------------------------------------------------------------------------
  type("pet-food", "Pet food", {
    dept: "farm-inputs", cats: ["pet-shop-vet", "agrovet"],
    axes: [ax("pet", "Pet", { values: ["Dog", "Puppy", "Cat", "Kitten", "Bird", "Fish", "Rabbit", "Hamster"] }), ax("pack", "Pack", { scale: "weight", values: ["500 g", "1 kg", "3 kg", "5 kg", "10 kg", "15 kg", "20 kg"] }), ax("flavour", "Flavour", { open: "flavour", values: ["Chicken", "Beef", "Fish", "Lamb", "Mixed"] })],
    rows: [req(o("brand", "Brand")), req(c("form", "Form", ["Dry", "Wet", "Treats", "Raw"])), rec(c("life-stage", "Life stage", ["Puppy or kitten", "Adult", "Senior", "All"])), rec(t("best-before", "Best before"))],
    x: { open: ["brand", "flavour"] }
  }),
  type("pet-accessories", "Pet accessories and care", {
    dept: "farm-inputs", cats: ["pet-shop-vet"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Collar", "Leash", "Bowl", "Bed", "Cage", "Aquarium", "Toy", "Shampoo", "Carrier", "Tick and flea control"] }), ax("size", "Size", { values: ["XS", "S", "M", "L", "XL"] }), colour()],
    rows: [req(c("pet", "For", ["Dog", "Cat", "Bird", "Fish", "Small pets"])), rec(o("brand", "Brand")), rec(o("material", "Material")), rec(t("dimensions", "Dimensions"))],
    x: { open: ["brand", "material", "colour"] }
  }),
  type("pet-grooming-boarding", "Pet grooming and boarding", {
    dept: "farm-inputs", cats: ["pet-shop-vet"], kind: "service",
    axes: [ax("service", "Service", { values: ["Bath", "Full grooming", "Nail trim", "Boarding per night", "Day care", "Training session", "Vaccination"] }), ax("pet", "Pet size", { values: ["Small", "Medium", "Large", "Cat"] })],
    rows: [req(t("duration", "How long it takes")), rec(b("pickup", "Pickup and drop")), rec(b("vet", "Vet on site")), rec(t("requirements", "Vaccination needed"))],
    x: {}
  })
];
