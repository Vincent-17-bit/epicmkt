import { itemTemplateFor } from "@epicmkt/shared";

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));

const field = (type, key, label, extra = {}) => ({ key, label, type, ...extra });

const flag = (key, label, extra) => field("boolean", key, label, { filterable: true, ...extra });
const choice = (key, label, pairs, extra) => field("select", key, label, { options: opts(pairs), filterable: true, ...extra });
const multi = (key, label, pairs, extra) => field("multiselect", key, label, { options: opts(pairs), filterable: true, ...extra });
const amount = (key, label, extra) => field("number", key, label, extra);
const money = (key, label, extra) => field("price", key, label, extra);
const text = (key, label, extra) => field("text", key, label, extra);
const notes = (key, label, extra) => field("longtext", key, label, extra);
const hours = (key, label, extra) => field("timerange", key, label, extra);
const link = (key, label, extra) => field("url", key, label, extra);
const picture = (key, label, extra) => field("image", key, label, extra);
const list = (key, label, extra) => field("itemlist", key, label, extra);

const payment = () =>
  multi("payment", "Payment accepted", [["cash", "Cash"], ["mpesa", "M-PESA"], ["airtel", "Airtel Money"], ["card", "Card"]], {
    group: "Payment"
  });

const deliveryBlock = (feeLabel = "Delivery fee") => [
  flag("delivery", "Delivery", { group: "Delivery", showOnCard: true }),
  money("delivery-fee", feeLabel, { group: "Delivery", showIf: { key: "delivery", equals: true } }),
  amount("delivery-radius", "Delivery distance", { group: "Delivery", unit: "km", showIf: { key: "delivery", equals: true } })
];

const businessCategories = [
  {
    id: "barbershops", name: "Barbershops", singular: "Barbershop", icon: "scissors", hue: 210, blurb: "Cuts, fades and shaves",
    fields: [
      choice("booking", "Booking", [["walk-in", "Walk-in only"], ["appointment", "By appointment"], ["both", "Walk-in or appointment"]], { required: true, showOnCard: true, group: "Service" }),
      amount("chairs", "Barber chairs", { group: "Service", unit: "chairs", filterable: true }),
      flag("kids-cuts", "Kids' cuts", { group: "Service", showOnCard: true }),
      flag("beard-grooming", "Beard grooming", { group: "Service" }),
      flag("dreadlocks", "Dreadlocks and twists", { group: "Service" }),
      multi("amenities", "Facilities", [["waiting-area", "Waiting area"], ["tv", "TV"], ["wifi", "Free Wi-Fi"], ["charging", "Phone charging"], ["ac", "Air conditioning"]], { group: "Facilities" }),
      text("specialty", "Signature style", { group: "Service", searchable: true }),
      payment()
    ]
  },
  {
    id: "water-refill", name: "Water Refill Points", singular: "Water refill point", icon: "droplet", hue: 195, blurb: "Clean drinking water on tap",
    fields: [
      choice("water-type", "Water type", [["purified", "Purified"], ["borehole", "Borehole"], ["spring", "Spring"], ["treated-tap", "Treated tap water"]], { required: true, showOnCard: true, group: "Water" }),
      money("price-20l", "Price per 20 L refill", { required: true, filterable: true, showOnCard: true, group: "Water", unit: "per 20 L" }),
      multi("container-sizes", "Refill sizes", [["5l", "5 L"], ["10l", "10 L"], ["20l", "20 L"], ["bulk", "Bulk tank"]], { group: "Water" }),
      flag("jerrycans", "Sells jerrycans", { group: "Water" }),
      flag("quality-tested", "Water quality tested", { group: "Water" }),
      flag("bowser", "Water bowser for large orders", { group: "Water" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "chemists", name: "Chemists", singular: "Chemist", icon: "pills", hue: 150, blurb: "Pharmacies and health shops",
    fields: [
      flag("prescriptions", "Fills prescriptions", { showOnCard: true, group: "Pharmacy" }),
      flag("pharmacist", "Pharmacist on site", { group: "Pharmacy" }),
      text("licence", "Pharmacy licence number", { group: "Pharmacy", searchable: true }),
      multi("stocks", "Stocks", [["prescription", "Prescription medicine"], ["otc", "Over-the-counter medicine"], ["baby", "Baby products"], ["cosmetics", "Cosmetics"], ["equipment", "Medical equipment"], ["herbal", "Herbal products"]], { group: "Pharmacy", searchable: true }),
      flag("clinic", "On-site clinic", { group: "Health services" }),
      multi("health-services", "Health services", [["bp", "Blood pressure check"], ["glucose", "Blood sugar test"], ["vaccines", "Vaccinations"], ["family-planning", "Family planning"], ["testing", "Lab tests"]], { group: "Health services", searchable: true }),
      multi("insurance", "Insurance accepted", [["sha", "SHA"], ["private", "Private insurance"]], { group: "Payment" }),
      flag("open-24h", "Open 24 hours", { group: "Pharmacy", showOnCard: true }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "agrovets", name: "Agrovets", singular: "Agrovet", icon: "seedling", hue: 110, blurb: "Seeds, feeds and farm inputs",
    fields: [
      multi("sells", "Products", [["seeds", "Seeds"], ["fertilizer", "Fertiliser"], ["pesticides", "Pesticides"], ["animal-drugs", "Animal drugs"], ["feeds", "Animal feeds"], ["tools", "Farm tools"], ["irrigation", "Irrigation"]], { required: true, showOnCard: true, searchable: true, group: "Products" }),
      text("brands", "Main brands", { group: "Products", searchable: true }),
      flag("vet-services", "Vet services", { group: "Advice" }),
      flag("agronomist", "Agronomy advice", { group: "Advice" }),
      flag("bulk", "Bulk and wholesale prices", { group: "Terms" }),
      flag("credit", "Credit for regular farmers", { group: "Terms" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "gyms", name: "Gyms", singular: "Gym", icon: "dumbbell", hue: 20, blurb: "Small gyms and fitness studios",
    fields: [
      choice("audience", "Open to", [["mixed", "Everyone"], ["women", "Women only"], ["men", "Men only"]], { required: true, showOnCard: true, group: "Membership" }),
      multi("equipment", "Equipment", [["free-weights", "Free weights"], ["machines", "Machines"], ["cardio", "Cardio"], ["boxing", "Boxing"], ["crossfit", "CrossFit"]], { group: "Training", searchable: true }),
      multi("classes", "Classes", [["aerobics", "Aerobics"], ["zumba", "Zumba"], ["yoga", "Yoga"], ["spinning", "Spinning"], ["boxing", "Boxing"]], { group: "Training", searchable: true }),
      flag("trainers", "Personal trainers", { group: "Training", showOnCard: true }),
      flag("showers", "Showers", { group: "Facilities" }),
      flag("lockers", "Lockers", { group: "Facilities" }),
      flag("parking", "Parking", { group: "Facilities" }),
      flag("day-pass", "Day pass available", { group: "Membership" }),
      notes("rules", "Membership notes", { group: "Membership" }),
      payment()
    ]
  },
  {
    id: "car-wash", name: "Car Wash", singular: "Car wash", icon: "car", hue: 200, blurb: "Washing, valeting and detailing",
    fields: [
      multi("vehicles", "Vehicles washed", [["cars", "Cars"], ["suvs", "SUVs and pickups"], ["matatus", "Matatus and vans"], ["trucks", "Trucks"], ["motorbikes", "Motorbikes"]], { required: true, showOnCard: true, group: "Service" }),
      multi("wash-types", "Services", [["exterior", "Exterior wash"], ["interior", "Interior cleaning"], ["full", "Full wash"], ["engine", "Engine wash"], ["underbody", "Underbody wash"], ["polish", "Waxing and polishing"], ["upholstery", "Seat and carpet cleaning"]], { required: true, searchable: true, group: "Service" }),
      flag("mobile-wash", "We come to you", { group: "Service", showOnCard: true }),
      money("starting-price", "Basic wash from", { filterable: true, group: "Service" }),
      amount("bays", "Wash bays", { group: "Facilities", unit: "bays" }),
      choice("booking", "Booking", [["walk-in", "Walk-in only"], ["appointment", "By appointment"], ["both", "Walk-in or appointment"]], { group: "Service" }),
      flag("waiting-area", "Waiting area", { group: "Facilities" }),
      flag("shaded", "Covered wash bay", { group: "Facilities" }),
      payment()
    ]
  },
  {
    id: "salons", name: "Salons", singular: "Salon", icon: "spa", hue: 320, blurb: "Hair, braids and beauty",
    fields: [
      choice("clientele", "Open to", [["women", "Women"], ["men", "Men"], ["everyone", "Everyone"]], { required: true, showOnCard: true, group: "Service" }),
      flag("braiding", "Braiding", { group: "Hair", showOnCard: true }),
      flag("nails", "Nails", { group: "Beauty" }),
      multi("hair-services", "Hair services", [["wigs", "Wig installation"], ["relaxing", "Relaxing and treatments"], ["dye", "Colour"], ["weaving", "Weaving"], ["natural", "Natural hair care"], ["kids", "Kids' styling"]], { group: "Hair", searchable: true }),
      multi("beauty-services", "Beauty services", [["makeup", "Makeup"], ["waxing", "Waxing"], ["facials", "Facials"], ["massage", "Massage"], ["lashes", "Lashes and brows"]], { group: "Beauty", searchable: true }),
      flag("bridal", "Bridal packages", { group: "Service" }),
      link("booking-link", "Online booking link", { group: "Service" }),
      flag("home-service", "Home visits", { group: "Service" }),
      choice("booking", "Booking", [["walk-in", "Walk-in only"], ["appointment", "By appointment"], ["both", "Walk-in or appointment"]], { group: "Service" }),
      payment()
    ]
  },
  {
    id: "tailors", name: "Tailors and Boutiques", singular: "Tailor or boutique", icon: "shirt", hue: 290, blurb: "Made-to-measure, mitumba and new clothes",
    fields: [
      choice("shop-type", "Shop type", [["tailor", "Tailor"], ["boutique", "Boutique"], ["both", "Tailor and boutique"]], { required: true, showOnCard: true, group: "Shop" }),
      choice("condition", "Clothes sold", [["new", "New"], ["mitumba", "Mitumba (second-hand)"], ["both", "New and mitumba"]], { group: "Shop", showOnCard: true, showIf: { key: "shop-type", in: ["boutique", "both"] } }),
      multi("for", "Clothing for", [["women", "Women"], ["men", "Men"], ["kids", "Kids"]], { group: "Shop" }),
      flag("custom", "Made to measure", { group: "Tailoring", showIf: { key: "shop-type", in: ["tailor", "both"] } }),
      flag("alterations", "Alterations and repairs", { group: "Tailoring" }),
      multi("specialties", "Specialities", [["suits", "Suits"], ["dresses", "Dresses"], ["african-print", "Kitenge and African print"], ["uniforms", "School and work uniforms"], ["wedding", "Wedding wear"], ["embroidery", "Embroidery"], ["curtains", "Curtains and upholstery"]], { group: "Tailoring", searchable: true }),
      amount("turnaround", "Usual turnaround", { group: "Tailoring", unit: "days", filterable: true, showIf: { key: "shop-type", in: ["tailor", "both"] } }),
      flag("fitting", "Fitting room", { group: "Shop" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "hardware", name: "Hardware", singular: "Hardware shop", icon: "hammer", hue: 35, blurb: "Building and repair supplies",
    fields: [
      multi("sells", "Products", [["cement", "Cement"], ["iron-sheets", "Iron sheets and roofing"], ["timber", "Timber"], ["paint", "Paint"], ["plumbing", "Plumbing"], ["electrical", "Electrical"], ["tools", "Hand and power tools"], ["tiles", "Tiles"], ["blocks", "Building blocks"], ["tanks", "Water tanks"]], { required: true, showOnCard: true, searchable: true, group: "Products" }),
      text("brands", "Main brands", { group: "Products", searchable: true }),
      flag("tool-hire", "Tool hire", { group: "Services" }),
      flag("cutting", "Cutting and bending", { group: "Services" }),
      flag("bulk", "Bulk and contractor prices", { group: "Terms" }),
      flag("credit", "Credit for contractors", { group: "Terms" }),
      notes("terms", "Terms and delivery notes", { group: "Terms" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "mpesa", name: "M-PESA and Mobile Money", singular: "Mobile money agent", icon: "money-bill-transfer", hue: 140, blurb: "Deposits, withdrawals and bill payments",
    fields: [
      multi("networks", "Networks", [["mpesa", "M-PESA"], ["airtel", "Airtel Money"], ["tkash", "T-Kash"]], { required: true, showOnCard: true, group: "Agent" }),
      text("agent-number", "Agent number", { group: "Agent", searchable: true }),
      text("till-number", "Till number", { group: "Agent", searchable: true }),
      multi("services", "Services", [["deposit", "Deposits"], ["withdraw", "Withdrawals"], ["airtime", "Airtime"], ["bills", "Bill payments"], ["send", "Send money"], ["bank", "Bank agent"], ["registration", "SIM registration"], ["tokens", "Electricity tokens"]], { required: true, showOnCard: true, searchable: true, group: "Services" }),
      multi("banks", "Bank agency for", [["equity", "Equity"], ["kcb", "KCB"], ["coop", "Co-operative Bank"], ["family", "Family Bank"], ["absa", "Absa"]], { group: "Services", showIf: { key: "services", includes: "bank" } }),
      multi("extras", "Other services", [["printing", "Printing"], ["photocopy", "Photocopying"], ["passport-photos", "Passport photos"], ["ecitizen", "eCitizen and KRA help"]], { group: "Services", searchable: true }),
      flag("open-24h", "Open 24 hours", { group: "Agent", showOnCard: true }),
      flag("high-float", "Large cash float", { group: "Agent" })
    ]
  },
  {
    id: "groceries", name: "Groceries and Mboga", singular: "Grocery shop", icon: "basket-shopping", hue: 100, blurb: "Fruit, vegetables and everyday goods",
    fields: [
      choice("shop-type", "Shop type", [["stall", "Fruit and vegetable stall"], ["duka", "General duka"], ["mini", "Mini supermarket"]], { required: true, showOnCard: true, group: "Shop" }),
      multi("sells", "Sells", [["fruit", "Fruit"], ["vegetables", "Vegetables"], ["cereals", "Cereals and flour"], ["dairy", "Milk and dairy"], ["eggs", "Eggs"], ["bread", "Bread"], ["household", "Household goods"], ["drinks", "Drinks"]], { required: true, showOnCard: true, searchable: true, group: "Shop" }),
      flag("farm-fresh", "Direct from farmers", { group: "Shop" }),
      flag("wholesale", "Wholesale and bulk", { group: "Shop" }),
      list("price-board", "Today's prices", { group: "Prices" }),
      ...deliveryBlock(),
      money("min-order", "Minimum delivery order", { group: "Delivery", showIf: { key: "delivery", equals: true } }),
      payment()
    ]
  },
  {
    id: "butchery", name: "Butcheries", singular: "Butchery", icon: "drumstick-bite", hue: 355, blurb: "Fresh meat and nyama choma",
    fields: [
      multi("meats", "Meat sold", [["beef", "Beef"], ["goat", "Goat"], ["mutton", "Mutton"], ["pork", "Pork"], ["chicken", "Chicken"], ["fish", "Fish"], ["offals", "Offals and matumbo"], ["sausages", "Sausages"]], { required: true, showOnCard: true, searchable: true, group: "Meat" }),
      flag("halal", "Halal", { group: "Meat", showOnCard: true }),
      flag("cut-to-order", "Cut to order", { group: "Meat" }),
      flag("mincing", "Mincing", { group: "Meat" }),
      flag("refrigerated", "Refrigerated display", { group: "Meat" }),
      flag("health-licence", "Public health licence displayed", { group: "Meat" }),
      flag("nyama-choma", "Nyama choma on site", { group: "Meals", showOnCard: true }),
      flag("events", "Orders for events", { group: "Meat" }),
      list("price-board", "Prices per kg", { group: "Prices" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "eateries", name: "Eateries", singular: "Eatery", icon: "utensils", hue: 5, blurb: "Local kitchens and cafés",
    fields: [
      multi("cuisine", "Food", [["kenyan", "Kenyan"], ["swahili", "Swahili"], ["nyama-choma", "Nyama choma"], ["fast-food", "Fast food"], ["breakfast", "Breakfast and tea"], ["indian", "Indian"], ["vegetarian", "Vegetarian"]], { required: true, showOnCard: true, searchable: true, group: "Food" }),
      multi("meal-times", "Serves", [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["late", "Late night"]], { group: "Food" }),
      money("average-meal", "Typical meal", { group: "Food", filterable: true, showOnCard: true }),
      flag("takeaway", "Takeaway", { group: "Service" }),
      flag("dine-in", "Dine in", { group: "Service" }),
      flag("halal", "Halal", { group: "Food" }),
      flag("vegetarian-options", "Vegetarian options", { group: "Food" }),
      amount("seats", "Seats", { group: "Service", unit: "seats" }),
      flag("reservations", "Reservations", { group: "Service" }),
      flag("outdoor", "Outdoor seating", { group: "Service" }),
      list("menu", "Menu highlights", { group: "Menu" }),
      picture("menu-photo", "Menu board", { group: "Menu" }),
      link("menu-link", "Online menu or order page", { group: "Menu" }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "bakery", name: "Bakeries", singular: "Bakery", icon: "cake-candles", hue: 30, blurb: "Bread, cakes and pastries",
    fields: [
      multi("products", "Bakes", [["bread", "Bread"], ["cakes", "Cakes"], ["cupcakes", "Cupcakes"], ["pastries", "Pastries and samosas"], ["mandazi", "Mandazi and buns"], ["cookies", "Cookies"]], { required: true, showOnCard: true, searchable: true, group: "Products" }),
      flag("custom-cakes", "Custom and wedding cakes", { group: "Cakes", showOnCard: true }),
      amount("notice", "Notice for custom cakes", { group: "Cakes", unit: "days", showIf: { key: "custom-cakes", equals: true } }),
      multi("dietary", "Dietary options", [["eggless", "Eggless"], ["vegan", "Vegan"], ["sugar-free", "Sugar-free"], ["gluten-free", "Gluten-free"]], { group: "Products" }),
      hours("fresh-bread", "Fresh bread ready", { group: "Products" }),
      flag("wholesale", "Supplies shops and hotels", { group: "Terms" }),
      notes("order-notes", "How to order cakes", { group: "Cakes", showIf: { key: "custom-cakes", equals: true } }),
      list("cake-prices", "Cake prices", { group: "Prices", showIf: { key: "custom-cakes", equals: true } }),
      ...deliveryBlock(),
      payment()
    ]
  },
  {
    id: "mechanics", name: "Mechanics", singular: "Garage", icon: "wrench", hue: 240, blurb: "Garages and vehicle repair",
    fields: [
      choice("vehicles", "Vehicles", [["cars", "Cars and pickups"], ["motorbikes", "Motorbikes"], ["all", "All vehicles"]], { required: true }),
      flag("welding", "Welding"),
      flag("towing", "Towing")
    ]
  },
  {
    id: "phone-repair", name: "Phone Repair", singular: "Phone repair", icon: "mobile-screen", hue: 270, blurb: "Screens, batteries and unlocks",
    fields: [
      choice("devices", "Devices", [["phones", "Phones"], ["phones-laptops", "Phones and laptops"]], { required: true }),
      flag("same-day", "Same-day repair"),
      flag("warranty", "Repair warranty")
    ]
  }
];

// Item-level extras (what describes one product or service) come from the shared item templates, keyed by the
// database category id, so the mock and the seeded database cannot drift apart. fields above stay business-level.
export const categories = businessCategories.map((category) => ({ ...category, itemFields: itemTemplateFor(category.id) }));
