// A28: home, building, auto and personal services. Services have no unit quantity ("none": contact or book) unless the buyer picks a count.
// Rows labelled "Any category without product types" in the brief are the generic template (shared/src/specRules/genericTemplate.js).
import { ax, b, c, colour, d, n, o, rec, req, t, type } from "./lib.mjs";

const OPEN_MATERIAL = { open: ["material", "colour", "finish"] };
const finish = () => ax("finish", "Finish", { display: "swatch", open: "finish" });
const material = () => req(o("material", "Material"));

export const HOME_AUTO = [
  // ----- personal services
  type("salon-service", "Salon service", {
    kind: "service", dept: "beauty-personal-care", cats: ["salon-beauty"],
    axes: [ax("service", "Service", { display: "text-card" }), ax("length", "Length class", { values: ["Short", "Medium", "Long"] })],
    rows: [req(t("duration", "Duration")), rec(t("products-used", "Products used")), rec(t("booking-notice", "Booking notice"))]
  }),
  type("spa-treatment", "Spa and massage treatment", {
    kind: "service", dept: "beauty-personal-care", cats: ["spa-massage"],
    axes: [ax("treatment", "Treatment", { display: "text-card" }), ax("duration", "Duration", { scale: "duration", values: ["30 min", "1 hour", "90 min", "2 hours"] })],
    rows: [rec(t("contraindications", "Contraindications note"))]
  }),
  type("barbershop-service", "Barbershop service", {
    kind: "service", dept: "beauty-personal-care", cats: ["barbershop"],
    axes: [ax("service", "Service", { display: "text-card" }), ax("for", "Adult or kids", { values: ["Adult", "Kids"] })],
    rows: [rec(t("duration", "Duration"))]
  }),
  type("gym-membership", "Gym membership", {
    kind: "package", dept: "fitness", cats: ["gym-fitness"],
    axes: [ax("term", "Membership term", { scale: "duration", values: ["1 day", "1 week", "1 month", "3 months", "1 year"] })],
    rows: [req(t("included", "What is included")), rec(t("joining-fee", "Joining fee")), rec(t("peak-hours", "Peak hours"))]
  }),
  type("phone-repair", "Phone repair", {
    kind: "service", dept: "phones", cats: ["phone-repair"],
    axes: [ax("repair", "Repair", { display: "text-card", values: ["Screen", "Battery", "Charging port", "Speaker", "Software"] }), ax("model", "Compatible model", { scale: "compat-model", open: "model" })],
    rows: [rec(t("warranty-period", "Warranty period")), rec(t("turnaround", "Turnaround"))],
    x: { priceRule: "per-model", compat: { list: "phone-models", mode: "single" } }
  }),
  // ----- electronics and appliances
  type("appliance", "Appliance", {
    dept: "electronics", cats: ["electronics-appliances", "home-kitchen"],
    axes: [colour(), ax("capacity", "Capacity", { scale: "volume" })],
    rows: [req(o("brand", "Brand")), req(t("model", "Model")), req(t("warranty", "Warranty")), req(c("condition", "Condition", ["New", "Refurbished", "Used"])), rec(t("power", "Power")), rec(t("box-contents", "What is in the box")), rec(t("connectivity", "Connectivity"))],
    x: { open: ["brand", "colour"] }
  }),
  // ----- hardware and building
  type("iron-sheet", "Iron sheet and roofing", {
    dept: "hardware-building", cats: ["hardware-building"],
    axes: [ax("gauge", "Gauge", { scale: "gauge", values: ["28", "30"] }), ax("length", "Length", { scale: "length", values: ["2 m", "2.5 m", "3 m"] })],
    rows: [material(), req(o("brand", "Brand")), rec(t("finish", "Finish")), rec(t("standards-mark", "Standards mark"))],
    x: OPEN_MATERIAL
  }),
  type("timber", "Timber", {
    dept: "hardware-building", cats: ["hardware-building", "furniture-carpentry"],
    axes: [ax("section", "Section", { scale: "cross-section", values: ["2 × 2 in", "2 × 3 in", "2 × 4 in", "4 × 2 in"] }), ax("length", "Length", { scale: "length", values: ["3 m", "4 m", "4.8 m"] })],
    rows: [material(), req(t("standard", "Brand or standard")), rec(t("finish", "Finish"))],
    x: OPEN_MATERIAL
  }),
  type("pipe", "Pipe", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical", "hardware-building"],
    axes: [ax("diameter", "Diameter", { scale: "diameter", values: ["1/2 in", "3/4 in", "1 in", "2 in", "4 in"] }), ax("length", "Length", { scale: "length", values: ["1 m", "3 m", "6 m"] })],
    rows: [material(), req(t("rating", "Rating or diameter")), req(o("brand", "Brand")), rec(t("standards-mark", "Standards mark"))],
    x: { open: ["material", "brand"] }
  }),
  type("paint", "Paint", {
    dept: "hardware-building", cats: ["hardware-building"],
    axes: [ax("volume", "Volume", { scale: "volume", values: ["1 L", "4 L", "20 L"] }), colour()],
    rows: [material(), req(o("brand", "Brand")), rec(t("finish", "Finish")), rec(t("standards-mark", "Standards mark"))],
    x: OPEN_MATERIAL
  }),
  type("cement-sand-bags", "Cement and bagged material", {
    dept: "hardware-building", cats: ["hardware-building"],
    axes: [ax("weight", "Bag weight", { scale: "weight", values: ["25 kg", "32.5 kg", "50 kg"] })],
    rows: [material(), req(o("brand", "Brand")), rec(t("standards-mark", "Standards mark"))],
    x: OPEN_MATERIAL
  }),
  type("tiles", "Tiles", {
    dept: "hardware-building", cats: ["hardware-building", "furniture-carpentry"],
    axes: [ax("size", "Tile size", { scale: "dimensions", values: ["30 × 30 cm", "40 × 40 cm", "60 × 60 cm"] }), finish()],
    rows: [material(), req(o("brand", "Brand")), rec(t("pack-weight", "Pack weight"))],
    x: OPEN_MATERIAL
  }),
  type("rope-wire-by-metre", "Rope, chain and wire (by the metre)", {
    dept: "hardware-building", cats: ["hardware-building", "plumbing-electrical"], qty: "measure",
    axes: [ax("diameter", "Diameter", { scale: "diameter" })],
    rows: [material(), req(t("standard", "Brand or standard"))],
    x: { open: ["material"], measureUnit: "m" }
  }),
  // ----- plumbing and electrical
  type("electrical-wire", "Electrical wire and cable", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical", "hardware-building"],
    axes: [ax("section", "Size", { scale: "cross-section", values: ["1.5 mm²", "2.5 mm²", "4 mm²", "6 mm²"] }), ax("length", "Length", { scale: "length", values: ["50 m", "100 m"] }), colour()],
    rows: [req(t("rating", "Rating (A or V)")), material(), req(o("brand", "Brand")), rec(t("standards-mark", "Standards mark")), rec(t("warranty", "Warranty"))],
    x: { open: ["material", "brand"] }
  }),
  type("socket-switch", "Socket and switch", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical", "electronics-appliances"],
    axes: [ax("gangs", "Gangs", { scale: "count", values: ["1", "2", "3", "4"] })],
    rows: [req(t("rating", "Rating (A)")), material(), req(o("brand", "Brand")), rec(t("standards-mark", "Standards mark"))],
    x: { open: ["material", "brand"] }
  }),
  type("circuit-breaker", "Circuit breaker", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical"],
    axes: [ax("current", "Current", { scale: "current", values: ["6 A", "10 A", "16 A", "32 A", "63 A"] })],
    rows: [req(t("rating", "Rating (V)")), req(o("brand", "Brand")), rec(t("standards-mark", "Standards mark")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand"] }
  }),
  type("water-tank", "Water tank", {
    dept: "plumbing-electrical", cats: ["plumbing-electrical", "hardware-building"],
    axes: [ax("volume", "Volume", { scale: "volume", values: ["500 L", "1000 L", "2000 L", "5000 L", "10000 L"] }), colour()],
    rows: [material(), req(o("brand", "Brand")), rec(t("warranty", "Warranty"))],
    x: OPEN_MATERIAL
  }),
  // ----- furniture and carpentry (dimension labels per type: table, chair, sofa, bed, door)
  type("table", "Table", {
    dept: "furniture", cats: ["furniture-carpentry", "home-kitchen"],
    axes: [ax("size", "Size", { display: "text-card", scale: "dimensions" }), finish()],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(b("assembly", "Assembly needed")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "table", dimensionsPerOption: true }
  }),
  type("chair", "Chair", {
    dept: "furniture", cats: ["furniture-carpentry", "home-kitchen"],
    axes: [colour(), ax("seats", "Seats", { scale: "count", values: ["1", "2", "4", "6"] })],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(b("assembly", "Assembly needed")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "generic", dimensionsPerOption: true }
  }),
  type("sofa", "Sofa", {
    dept: "furniture", cats: ["furniture-carpentry"],
    axes: [ax("seats", "Seats", { display: "text-card", scale: "count", values: ["2-seater", "3-seater", "4-seater", "L-shape"] }), ax("upholstery", "Upholstery", { display: "swatch", open: "material", values: ["Leather", "Fabric"] })],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(b("assembly", "Assembly needed")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "sofa", dimensionsPerOption: true }
  }),
  type("bed", "Bed", {
    dept: "furniture", cats: ["furniture-carpentry", "home-kitchen"],
    axes: [ax("size", "Bed size", { scale: "bed-size", values: ["3 × 6", "4 × 6", "5 × 6", "6 × 6"] }), finish()],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(b("assembly", "Assembly needed")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "generic", dimensionsPerOption: true }
  }),
  type("mattress", "Mattress", {
    dept: "furniture", cats: ["furniture-carpentry", "home-kitchen"],
    axes: [ax("size", "Bed size", { scale: "bed-size", values: ["3 × 6", "4 × 6", "5 × 6", "6 × 6"] }), ax("thickness", "Thickness", { scale: "thickness", values: ["4 in", "6 in", "8 in", "10 in"] })],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(c("firmness", "Firmness", ["Soft", "Medium", "Firm"])), rec(t("warranty", "Warranty"))],
    x: { open: ["material"], dimensionProfile: "generic" }
  }),
  type("door-window", "Door and window", {
    dept: "furniture", cats: ["furniture-carpentry", "hardware-building"],
    axes: [ax("size", "Size", { display: "text-card", scale: "dimensions" }), finish()],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "door", dimensionsPerOption: true }
  }),
  type("wardrobe-cabinet", "Wardrobe, cabinet and shelves", {
    dept: "furniture", cats: ["furniture-carpentry", "home-kitchen"],
    axes: [ax("size", "Size", { display: "text-card", scale: "dimensions" }), finish()],
    rows: [material(), req(d("dimensions", "Dimensions")), rec(n("weight", "Weight (kg)")), rec(b("assembly", "Assembly needed")), rec(t("warranty", "Warranty"))],
    x: { ...OPEN_MATERIAL, dimensionProfile: "sofa", dimensionsPerOption: true }
  }),
  // ----- cleaning and laundry
  type("laundry-by-weight", "Laundry (by weight)", {
    kind: "service", dept: "cleaning-laundry", cats: ["cleaning-laundry"], qty: "measure",
    axes: [ax("service", "Service", { values: ["Wash and fold", "Wash and iron", "Dry clean"] })],
    rows: [req(c("price-unit", "Price unit", ["Per kg"])), rec(t("turnaround", "Turnaround")), rec(b("pickup", "Pickup"))],
    x: { measureUnit: "kg" }
  }),
  type("laundry-by-item", "Laundry (by item)", {
    kind: "service", dept: "cleaning-laundry", cats: ["cleaning-laundry"], qty: "units",
    axes: [ax("item", "Item type", { scale: "label", display: "text-card", values: ["Shirt", "Trousers", "Suit", "Dress", "Bedsheet", "Duvet", "Curtain"] })],
    rows: [req(c("price-unit", "Price unit", ["Per item"])), rec(t("turnaround", "Turnaround")), rec(b("pickup", "Pickup"))]
  }),
  // ----- tailor and cobbler
  type("fabric-by-metre", "Fabric (by the metre)", {
    dept: "clothing", cats: ["tailor-boutique", "fashion-boutiques"], qty: "measure",
    axes: [colour()],
    rows: [req(o("fabric", "Fabric")), req(t("width", "Width (cm)")), rec(t("care", "Care"))],
    x: { open: ["colour", "fabric"], measureUnit: "m" }
  }),
  type("tailoring", "Tailoring and alterations", {
    kind: "service", dept: "clothing", cats: ["tailor-boutique"],
    axes: [ax("service", "Service", { display: "text-card", values: ["Made to measure", "Alteration", "Repair"] })],
    rows: [rec(t("turnaround", "Turnaround")), rec(t("fitting", "Fittings"))]
  }),
  type("shoe-repair", "Shoe repair", {
    kind: "service", dept: "shoes", cats: ["shoes-cobbler"],
    axes: [ax("service", "Service", { display: "text-card", values: ["Re-sole", "Heel", "Stitching", "Polish", "Stretching"] })],
    rows: [rec(t("turnaround", "Turnaround"))]
  }),
  // ----- garage, car wash and auto parts
  type("garage-service", "Garage service", {
    kind: "service", dept: "auto-parts", cats: ["garage-mechanic"],
    axes: [ax("service", "Service", { display: "text-card" }), ax("vehicle", "Vehicle class", { scale: "vehicle-class", values: ["Saloon", "SUV", "Pickup", "Van", "Truck"] })],
    rows: [rec(t("duration", "Duration")), rec(t("warranty", "Warranty"))]
  }),
  type("car-wash", "Car wash", {
    kind: "service", dept: "auto-parts", cats: ["car-wash"],
    axes: [ax("wash", "Wash type", { display: "text-card", values: ["Exterior", "Interior", "Full wash", "Engine wash", "Polish"] }), ax("vehicle", "Vehicle class", { scale: "vehicle-class", values: ["Saloon", "SUV", "Pickup", "Van", "Truck"] })],
    rows: [rec(t("duration", "Duration")), rec(t("products-used", "Products used"))],
    x: { priceGrid: ["wash", "vehicle"] }
  }),
  type("tyre", "Tyre", {
    dept: "auto-parts", cats: ["auto-spare-parts"],
    axes: [ax("size", "Tyre size", { scale: "tyre-size", values: ["175/70 R13", "185/65 R15", "205/55 R16", "225/65 R17"] })],
    rows: [req(o("brand", "Brand")), req(t("compatible-vehicles", "Compatible vehicles")), req(c("condition", "Condition", ["Genuine", "Aftermarket", "Used"])), rec(t("part-number", "Part number")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand"], compat: { list: "vehicles", mode: "multi" } }
  }),
  type("car-battery", "Car battery", {
    dept: "auto-parts", cats: ["auto-spare-parts"],
    axes: [ax("capacity", "Capacity", { scale: "battery-capacity", values: ["45 Ah", "60 Ah", "70 Ah", "100 Ah"] })],
    rows: [req(o("brand", "Brand")), req(t("compatible-vehicles", "Compatible vehicles")), req(c("condition", "Condition", ["Genuine", "Aftermarket", "Used"])), rec(t("part-number", "Part number")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand"], compat: { list: "vehicles", mode: "multi" } }
  }),
  type("engine-oil", "Engine oil", {
    dept: "auto-parts", cats: ["auto-spare-parts", "garage-mechanic"],
    axes: [ax("volume", "Volume", { scale: "volume", values: ["1 L", "4 L", "5 L", "20 L"] }), ax("grade", "Grade", { values: ["5W-30", "10W-40", "15W-40", "20W-50"] })],
    rows: [req(o("brand", "Brand")), req(t("compatible-vehicles", "Compatible vehicles")), req(c("condition", "Condition", ["Genuine", "Aftermarket"])), rec(t("part-number", "Part number"))],
    x: { open: ["brand"] }
  }),
  type("wiper-blade", "Wiper blade", {
    dept: "auto-parts", cats: ["auto-spare-parts"],
    axes: [ax("length", "Length", { scale: "length", values: ["14 in", "16 in", "18 in", "20 in", "24 in"] })],
    rows: [req(o("brand", "Brand")), req(t("compatible-vehicles", "Compatible vehicles")), req(c("condition", "Condition", ["Genuine", "Aftermarket", "Used"])), rec(t("part-number", "Part number"))],
    x: { open: ["brand"] }
  }),
  type("spare-part", "Spare part", {
    dept: "auto-parts", cats: ["auto-spare-parts"],
    rows: [req(o("brand", "Brand")), req(t("compatible-vehicles", "Compatible vehicles")), req(c("condition", "Condition", ["Genuine", "Aftermarket", "Used"])), rec(t("part-number", "Part number")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand"], compat: { list: "vehicles", mode: "multi" } }
  }),
  // ----- photography and events
  type("photo-package", "Photography package", {
    kind: "package", dept: "photography-events", cats: ["photography-events"],
    axes: [ax("package", "Package", { display: "text-card" }), ax("hours", "Hours covered", { scale: "duration", values: ["1 hour", "2 hours", "4 hours", "8 hours"] })],
    rows: [req(t("deliverables", "Deliverables")), rec(t("delivery-time", "Delivery time")), rec(t("extra-hour", "Extra hour price"))]
  })
];
