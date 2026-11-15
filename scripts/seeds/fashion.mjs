// A24: boutique and fashion types. One entry per row of the A24 table.
import { ax, b, c, colour, d, ls, n, o, rec, req, reqIf, precious, t, type, FASHION_SHOPS, SHOE_SHOPS, BEAUTY_SHOPS } from "./lib.mjs";

const GENDER = c("for", "For", ["Women", "Men", "Unisex"]);
const FIT = c("fit", "Fit", ["Slim", "Regular", "Loose"]);
const metalFinish = (label = "Finish") => ax("finish", label, { display: "swatch", open: "finish", values: ["Gold", "Silver", "Rose gold", "Black", "Mixed"] });

export const FASHION = [
  type("clothing", "Clothing (dress, top, skirt, trousers, jacket, cardigan)", {
    dept: "clothing", cats: FASHION_SHOPS,
    axes: [colour(), ax("size", "Size", { scale: "apparel-alpha", values: ["XS", "S", "M", "L", "XL", "XXL"], sizeChart: "apparel" })],
    rows: [req(o("fabric", "Fabric")), req(t("care", "Care")), rec(FIT), rec(t("lining", "Lining")), rec(t("occasion", "Occasion"))],
    x: { sizeChart: "apparel", altScales: ["apparel-numeric"], open: ["colour", "fabric"] }
  }),
  type("dress-shirt", "Dress shirt", {
    dept: "clothing", cats: FASHION_SHOPS,
    axes: [colour(), ax("collar", "Collar", { scale: "collar-inch" }), ax("sleeve", "Sleeve", { values: ["Short", "Long"] })],
    rows: [req(o("fabric", "Fabric")), req(t("care", "Care")), rec(FIT), rec(t("pattern", "Pattern"))],
    x: { sizeChart: "shirt", open: ["colour", "fabric"] }
  }),
  type("kids-clothing", "Kids clothing", {
    dept: "clothing", cats: FASHION_SHOPS,
    axes: [colour(), ax("age", "Age size", { scale: "kids-age", sizeChart: "kids" })],
    rows: [req(o("fabric", "Fabric")), req(t("care", "Care")), rec(c("gender", "Gender", ["Girls", "Boys", "Unisex"]))],
    x: { sizeChart: "kids", open: ["colour", "fabric"] }
  }),
  type("shoes", "Shoes", {
    dept: "shoes", cats: SHOE_SHOPS,
    axes: [colour(), ax("size", "Size", { scale: "shoe", sizeChart: "shoe" }), ax("width", "Width", { values: ["Narrow", "Regular", "Wide"] })],
    rows: [req(o("upper-material", "Upper material")), rec(o("sole-material", "Sole material")), rec(t("closure", "Closure"))],
    x: { sizeChart: "shoe", showSystem: true, open: ["colour", "material"] }
  }),
  type("handbag", "Handbag", {
    dept: "bags", cats: FASHION_SHOPS,
    axes: [colour(), ax("size", "Size", { values: ["Small", "Medium", "Large"] })],
    rows: [req(o("material", "Material")), req(d("dimensions", "Dimensions")), req(t("closure", "Closure")), rec(n("compartments", "Compartments")), rec(t("strap-type", "Strap type")), rec(t("lining", "Lining"))],
    x: { open: ["colour", "material"] }
  }),
  type("backpack-travel-bag", "Backpack and travel bag", {
    dept: "bags", cats: FASHION_SHOPS,
    axes: [colour(), ax("capacity", "Capacity", { scale: "volume", values: ["20 L", "30 L", "40 L", "60 L"] })],
    rows: [req(o("material", "Material")), req(d("dimensions", "Dimensions")), rec(n("laptop-fit", "Laptop fit (inch)")), rec(b("water-resistant", "Water resistant"))],
    x: { open: ["colour", "material"] }
  }),
  type("wallet-purse", "Wallet and purse", {
    dept: "bags", cats: FASHION_SHOPS,
    axes: [colour()],
    rows: [req(o("material", "Material")), req(d("dimensions", "Dimensions")), rec(n("card-slots", "Card slots"))],
    x: { open: ["colour", "material"] }
  }),
  type("belt", "Belt", {
    dept: "clothing", cats: FASHION_SHOPS,
    axes: [colour(), ax("size", "Length or waist", { scale: "length", values: ["80 cm", "90 cm", "100 cm", "110 cm", "120 cm"] })],
    rows: [req(o("material", "Material")), req(t("buckle", "Buckle"))],
    x: { open: ["colour", "material"] }
  }),
  type("necklace-chain-bracelet", "Necklace, chain, bracelet", {
    dept: "jewellery", cats: [...FASHION_SHOPS, "salon-beauty"],
    axes: [metalFinish("Finish (metal colour)"), ax("length", "Length", { scale: "length", values: ["40 cm", "45 cm", "50 cm", "60 cm"] })],
    rows: [req(o("material", "Material")), reqIf(t("purity", "Purity"), precious), rec(t("pendant-or-stone", "Pendant or stone")), rec(t("clasp", "Clasp")), rec(b("hypoallergenic", "Hypoallergenic or nickel free")), rec(n("weight", "Weight (g)")), rec(b("gift-box", "Gift box"))],
    x: { open: ["material", "finish", "stone"] }
  }),
  type("earrings", "Earrings", {
    dept: "jewellery", cats: [...FASHION_SHOPS, "salon-beauty"],
    axes: [metalFinish(), ax("style", "Style", { values: ["Stud", "Hoop", "Drop"] })],
    rows: [req(o("material", "Material")), reqIf(t("purity", "Purity"), precious), rec(b("hypoallergenic", "Hypoallergenic")), rec(n("size-mm", "Size (mm)"))],
    x: { open: ["material", "finish"] }
  }),
  type("ring", "Ring", {
    dept: "jewellery", cats: [...FASHION_SHOPS, "salon-beauty"],
    axes: [metalFinish(), ax("size", "Ring size", { scale: "ring-size", values: ["5", "6", "7", "8", "9", "10"] })],
    rows: [req(o("material", "Material")), reqIf(t("purity", "Purity"), precious), rec(t("stone", "Stone")), rec(n("weight", "Weight (g)"))],
    x: { open: ["material", "finish"] }
  }),
  type("watch", "Watch", {
    dept: "jewellery", cats: FASHION_SHOPS,
    axes: [ax("strap_colour", "Strap colour", { display: "swatch", open: "colour" }), ax("case_size", "Case size", { scale: "length", values: ["36 mm", "40 mm", "42 mm", "44 mm"] })],
    rows: [req(o("brand", "Brand")), req(t("movement", "Movement")), req(o("strap-material", "Strap material")), req(t("water-resistance", "Water resistance")), rec(t("warranty", "Warranty")), rec(GENDER)],
    x: { open: ["brand", "strap-material"] }
  }),
  type("sunglasses", "Sunglasses", {
    dept: "eyewear", cats: [...FASHION_SHOPS, "optician"],
    axes: [ax("frame_colour", "Frame colour", { display: "swatch", open: "colour" })],
    rows: [req(o("frame-material", "Frame material")), req(t("uv-protection", "UV protection")), rec(t("lens-colour", "Lens colour")), rec(n("lens-width", "Lens width (mm)"))],
    x: { open: ["colour", "material"] }
  }),
  type("scarf-hat-cap", "Scarf, hat, cap", {
    dept: "clothing", cats: FASHION_SHOPS,
    axes: [colour(), ax("size", "Size", { values: ["One size", "S", "M", "L"] })],
    rows: [req(o("material", "Material")), req(t("size-note", "Size or dimensions")), rec(c("season", "Season", ["Hot", "Cold", "All year"]))],
    x: { open: ["colour", "material"] }
  }),
  type("fragrance", "Fragrance", {
    dept: "fragrance", cats: BEAUTY_SHOPS,
    axes: [ax("volume", "Volume", { scale: "volume", values: ["30 ml", "50 ml", "100 ml", "200 ml"] })],
    rows: [
      req(o("brand", "Brand")), req(c("concentration", "Concentration", ["Parfum", "EDP", "EDT", "Body spray", "Oil"])),
      req(c("for", "For", ["Women", "Men", "Unisex"])), req(ls("authenticity", "Original or inspired", "authenticity")),
      rec(t("notes", "Top, heart and base notes")), rec(t("expiry", "Expiry")), rec(b("box-included", "Box included")), rec(ls("fragrance-state", "Condition", "fragranceState"))
    ],
    x: { open: ["brand", "scent-family"] }
  }),
  type("makeup-skincare", "Makeup and skincare", {
    dept: "beauty-personal-care", cats: BEAUTY_SHOPS,
    axes: [ax("shade", "Shade", { display: "swatch", open: "colour" }), ax("size", "Volume or weight", { scale: "volume", values: ["30 ml", "50 ml", "100 ml"] })],
    rows: [req(o("brand", "Brand")), req(t("product-kind", "Product kind")), req(t("expiry", "Expiry")), rec(t("skin-type", "Skin type")), rec(t("ingredients", "Ingredients")), rec(t("allergens", "Allergens"))],
    x: { open: ["shade", "brand"] }
  }),
  type("hair-wigs", "Hair and wigs", {
    dept: "beauty-personal-care", cats: ["salon-beauty", ...FASHION_SHOPS],
    axes: [ax("length", "Length", { scale: "length", values: ["10 inch", "14 inch", "18 inch", "24 inch"] }), colour()],
    rows: [req(c("hair-type", "Hair type", ["Human", "Synthetic"])), rec(t("texture", "Texture")), rec(t("density", "Density"))],
    x: { open: ["colour"] }
  })
];
