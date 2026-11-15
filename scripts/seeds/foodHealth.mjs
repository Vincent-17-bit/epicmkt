// A27: food, water, health and farm spec rules. Water and bread follow the worked examples exactly.
// Quantity modes: butchery and greengrocer measure (kg); everything else is whole units.
// Prescription medicine is restricted to a chemist; vet medicine and agrochemicals to an agrovet (shared/src/types/restrictions.js).
import { ax, b, c, colour, n, o, rec, req, t, type } from "./lib.mjs";

const OPEN_BRAND = { open: ["brand"] };

export const FOOD_HEALTH = [
  type("drinking-water", "Drinking water", {
    dept: "water-energy", cats: ["water-refill", "supermarket-minimart"],
    axes: [
      ax("size", "Container size", { scale: "volume", values: ["5 L", "10 L", "20 L"] }),
      ax("fill", "How it is filled", { display: "button", values: [{ id: "refill", label: "Refill (bring your bottle)" }, { id: "new-bottle", label: "New bottle with water" }] })
    ],
    rows: [req(c("water-type", "Water type", ["Purified", "Borehole", "Spring"])), rec(t("treatment-method", "Treatment method")), rec(o("container-material", "Container material")), rec(t("bottle-deposit", "Bottle deposit")), rec(t("quality-test", "Quality test"))],
    x: { open: ["treatment", "container-material"], priceGrid: ["size", "fill"], unitPrice: { per: "L", axis: "size" } }
  }),
  type("lpg-gas", "LPG gas", {
    dept: "water-energy", cats: ["lpg-gas"],
    axes: [ax("cylinder", "Cylinder weight", { scale: "weight", values: ["6 kg", "13 kg", "22.5 kg", "50 kg"] }), ax("fill", "Refill or new", { values: ["Refill", "New cylinder"] })],
    rows: [req(o("brand", "Brand")), rec(t("exchange-policy", "Exchange or deposit policy")), rec(t("standards-mark", "Standards mark"))],
    x: { ...OPEN_BRAND, priceGrid: ["cylinder", "fill"] }
  }),
  type("bread", "Bread", {
    dept: "food-drink", cats: ["bakery", "supermarket-minimart", "restaurant-cafe"],
    axes: [
      ax("weight", "Weight", { scale: "weight", values: ["400 g", "600 g", "800 g", "1 kg"] }),
      ax("kind", "Kind", { open: "kind", values: ["White", "Brown", "Whole wheat"] })
    ],
    rows: [req(t("ingredients", "Ingredients")), req(t("allergens", "Allergens")), rec(t("shelf-life", "Shelf life")), rec(t("storage", "Storage")), rec(c("sliced", "Sliced or unsliced", ["Sliced", "Unsliced"])), rec(t("ready-from", "Ready from")), rec(t("dietary-notes", "Dietary notes"))],
    x: { open: ["kind", "flavour"], priceGrid: ["weight", "kind"], unitPrice: { per: "kg", axis: "weight" } }
  }),
  type("cake", "Cake", {
    dept: "food-drink", cats: ["bakery"],
    axes: [ax("weight", "Weight", { scale: "weight", values: ["1 kg", "2 kg", "3 kg", "5 kg"] }), ax("flavour", "Flavour", { open: "flavour", values: ["Vanilla", "Chocolate", "Red velvet", "Fruit"] })],
    rows: [req(t("ingredients", "Ingredients")), req(t("allergens", "Allergens")), rec(n("tiers", "Tiers")), rec(t("ready-from", "Ready from")), rec(t("dietary-notes", "Dietary notes"))],
    x: { open: ["kind", "flavour"], priceGrid: ["weight", "flavour"] }
  }),
  type("cupcakes-pastries", "Cupcakes and pastries", {
    dept: "food-drink", cats: ["bakery"],
    axes: [ax("box", "Box of", { scale: "count", values: ["1", "6", "12", "24"] }), ax("flavour", "Flavour", { open: "flavour" })],
    rows: [req(t("ingredients", "Ingredients")), req(t("allergens", "Allergens")), rec(t("shelf-life", "Shelf life")), rec(t("storage", "Storage"))],
    x: { open: ["kind", "flavour"] }
  }),
  type("juice", "Juice", {
    dept: "food-drink", cats: ["juice-shop"],
    axes: [ax("cup", "Cup size", { scale: "volume", values: ["300 ml", "500 ml", "1 L"] }), ax("flavour", "Flavour", { open: "flavour", values: ["Mango", "Passion", "Orange", "Mixed fruit"] })],
    rows: [req(t("ingredients", "Ingredients")), rec(t("sugar-level", "Sugar level")), rec(t("allergens", "Allergens"))],
    x: { open: ["flavour"], priceGrid: ["cup", "flavour"] }
  }),
  type("restaurant-meal", "Restaurant meal", {
    dept: "food-drink", cats: ["restaurant-cafe"],
    axes: [ax("portion", "Portion", { scale: "portion", values: ["Small", "Regular", "Large", "Half plate", "Full plate"] })],
    rows: [req(t("main-ingredients", "Main ingredients")), rec(t("allergens", "Allergens")), rec(b("halal", "Halal")), rec(c("spice", "Spice level", ["Mild", "Medium", "Hot"]))]
  }),
  type("meat-by-weight", "Meat sold by weight", {
    dept: "food-drink", cats: ["butchery", "supermarket-minimart"], qty: "measure",
    axes: [ax("cut", "Cut", { display: "text-card", open: "cut", values: ["Steak", "Mince", "Ribs", "With bones", "Boneless"] })],
    rows: [req(c("meat-type", "Meat type", ["Beef", "Goat", "Mutton", "Pork", "Chicken", "Fish"])), req(c("price-unit", "Price unit", ["Per kg"])), rec(b("halal", "Halal")), rec(c("storage", "Chilled or frozen", ["Chilled", "Frozen"])), rec(t("packed-on", "Packed on"))],
    x: { open: ["cut"], measureUnit: "kg" }
  }),
  type("produce", "Produce (fruit and vegetables)", {
    dept: "food-drink", cats: ["greengrocer"], qty: "measure",
    axes: [ax("sold_by", "Sold by", { values: ["kg", "Bunch", "Crate"] })],
    rows: [req(o("produce", "Produce")), rec(t("origin", "Origin")), rec(t("grade", "Grade"))],
    x: { open: ["produce"], measureUnit: "kg", unitsAllowed: true }
  }),
  type("packaged-food", "Packaged food", {
    dept: "food-drink", cats: ["supermarket-minimart"],
    axes: [ax("pack", "Pack size", { scale: "weight", values: ["250 g", "500 g", "1 kg", "2 kg"] }), ax("flavour", "Flavour", { open: "flavour" })],
    rows: [req(o("brand", "Brand")), rec(t("ingredients", "Ingredients")), rec(t("allergens", "Allergens")), rec(t("best-before", "Best before")), rec(t("origin", "Country of origin"))],
    x: { open: ["brand", "flavour"] }
  }),
  type("liquor", "Liquor", {
    dept: "food-drink", cats: ["supermarket-minimart"],
    axes: [ax("volume", "Volume", { scale: "volume", values: ["250 ml", "500 ml", "750 ml", "1 L"] })],
    rows: [req({ key: "authenticity", label: "Authenticity", input: "choice", labelSet: "authenticity" }), rec(t("alcohol-strength", "Alcohol strength"))],
    x: OPEN_BRAND
  }),
  type("medicine", "Medicine (over the counter)", {
    dept: "medicine-health", cats: ["chemist"],
    axes: [ax("strength", "Strength", { display: "text-card" }), ax("pack", "Pack count", { scale: "count", values: ["10", "20", "30", "100"] })],
    rows: [req(c("dosage-form", "Dosage form", ["Tablet", "Capsule", "Syrup", "Cream", "Drops", "Injection", "Other"])), req(c("prescription", "Prescription needed", ["No"])), rec(t("active-ingredient", "Active ingredient")), rec(t("manufacturer", "Manufacturer")), rec(t("expiry", "Expiry")), rec(t("storage", "Storage")), rec(t("age-group", "Age group"))],
    x: OPEN_BRAND
  }),
  type("prescription-medicine", "Prescription medicine", {
    dept: "medicine-health", cats: ["chemist"], restrict: ["chemist"],
    axes: [ax("strength", "Strength", { display: "text-card" }), ax("pack", "Pack count", { scale: "count", values: ["10", "20", "30", "100"] })],
    rows: [req(c("dosage-form", "Dosage form", ["Tablet", "Capsule", "Syrup", "Cream", "Drops", "Injection", "Other"])), req(c("prescription", "Prescription needed", ["Yes"])), rec(t("active-ingredient", "Active ingredient")), rec(t("manufacturer", "Manufacturer")), rec(t("expiry", "Expiry")), rec(t("storage", "Storage")), rec(t("age-group", "Age group"))],
    x: OPEN_BRAND
  }),
  type("frames", "Frames", {
    dept: "eyewear", cats: ["optician"],
    axes: [colour("Frame colour"), ax("size", "Frame size", { scale: "frame-size" })],
    rows: [req(o("frame-material", "Frame material")), rec(t("lens-type", "Lens type")), rec(c("fit", "Fit", ["Adult", "Kids"]))],
    x: { open: ["colour", "material"] }
  }),
  type("vet-medicine", "Veterinary medicine", {
    dept: "farm-inputs", cats: ["agrovet"], restrict: ["agrovet"],
    axes: [ax("pack", "Pack size", { scale: "volume", values: ["50 ml", "100 ml", "250 ml", "500 ml", "1 L"] })],
    rows: [req(o("brand", "Brand")), req(t("use", "Animal")), rec(t("active-ingredient", "Active ingredient")), rec(t("application-rate", "Application rate")), rec(t("safety-warning", "Safety warning"))],
    x: OPEN_BRAND
  }),
  type("agrochemicals", "Agrochemicals", {
    dept: "farm-inputs", cats: ["agrovet"], restrict: ["agrovet"],
    axes: [ax("pack", "Pack size", { scale: "volume", values: ["100 ml", "250 ml", "500 ml", "1 L", "5 L"] })],
    rows: [req(o("brand", "Brand")), req(t("use", "Crop")), rec(t("active-ingredient", "Active ingredient")), rec(t("application-rate", "Application rate")), rec(t("safety-warning", "Safety warning"))],
    x: OPEN_BRAND
  }),
  type("agrovet-supplies", "Agrovet supplies (feed, seed, fertiliser)", {
    dept: "farm-inputs", cats: ["agrovet"],
    axes: [ax("pack", "Pack size", { scale: "weight", values: ["1 kg", "2 kg", "10 kg", "25 kg", "50 kg"] })],
    rows: [req(o("brand", "Brand")), req(t("use", "Crop or animal")), rec(t("active-ingredient", "Active ingredient")), rec(t("safety-warning", "Safety warning"))],
    x: OPEN_BRAND
  })
];
