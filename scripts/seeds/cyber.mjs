// A26: cyber, printing and stationery types. Services carry kind "service"; printing, scanning and banners carry price-tier starts
// (A14 shape: minQty, maxQty, unitPrice; the seller fills in the prices); computer use is priced per duration.
import { ax, b, c, colour, n, o, rec, req, t, tiers, type, PRINT_SHOPS } from "./lib.mjs";

const SHOPS = [...PRINT_SHOPS];
const TURNAROUND = rec(t("turnaround", "Turnaround"));
const PAPER = ax("paper", "Paper size", { scale: "paper-size", values: ["A4", "A3", "A5"] });
const BRAND = { open: ["brand"] };

export const CYBER = [
  type("printing", "Printing and photocopy", {
    kind: "service", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [PAPER, ax("colour_mode", "Colour mode", { values: ["Black and white", "Colour"] }), ax("sides", "Sides", { values: ["Single-sided", "Double-sided"] })],
    rows: [TURNAROUND, rec(n("paper-weight", "Paper weight (gsm)")), rec(t("file-formats", "Accepted file formats"))],
    x: { priceRule: "tiers-by-pages", tiers: tiers(1, 11, 51, 201) }
  }),
  type("scanning", "Scanning", {
    kind: "service", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [PAPER, ax("output", "Output", { values: ["PDF", "Image"] })],
    rows: [TURNAROUND],
    x: { priceRule: "tiers-by-pages", tiers: tiers(1, 11, 51) }
  }),
  type("lamination", "Lamination", {
    kind: "service", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [ax("size", "Size", { values: ["ID", "A5", "A4", "A3"] }), ax("thickness", "Thickness", { scale: "thickness", values: ["80 micron", "125 micron", "250 micron"] })],
    rows: [rec(t("thickness-note", "Thickness"))]
  }),
  type("binding", "Binding", {
    kind: "service", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [ax("kind", "Type", { values: ["Spiral", "Thermal", "Hardcover"] }), ax("pages", "Pages", { values: ["Up to 50", "Up to 100", "Up to 200"] })],
    rows: [rec(t("cover", "Cover"))]
  }),
  type("typing-documents", "Typing and document services (CV, letters)", {
    kind: "package", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [ax("package", "Package", { display: "text-card", values: ["CV", "Cover letter", "Typing per page", "Full document"] }), ax("pages", "Pages", { values: ["1", "2", "3", "5", "10"] })],
    rows: [req(t("deliverables", "Deliverables")), TURNAROUND]
  }),
  type("passport-photos", "Passport and ID photos", {
    kind: "service", qty: "units", dept: "printing-services", cats: [...SHOPS, "photography-events"],
    axes: [ax("set", "Set", { values: ["4 photos", "8 photos"] }), ax("size", "Size", { values: ["Passport", "ID", "Visa"] })],
    rows: [rec(b("softcopy", "Softcopy included"))]
  }),
  type("banners-posters-cards", "Banners, posters, business cards", {
    kind: "service", qty: "units", dept: "printing-services", cats: SHOPS,
    axes: [ax("size", "Size (W × H)", { scale: "print-size", values: ["A4", "A3", "A2", "A1", "90 × 55 mm"] }), ax("material", "Material", { open: "material", values: ["Paper", "Vinyl", "Cloth", "Card"] }), ax("pack", "Pack", { values: ["100", "250", "500"] })],
    rows: [TURNAROUND],
    x: { priceRule: "quantity-packs", packs: [100, 250, 500], tiers: tiers(1, 100, 250, 500), open: ["material"] }
  }),
  type("computer-internet-use", "Computer and internet use", {
    kind: "service", qty: "units", dept: "printing-services", cats: ["cyber-cafe"],
    axes: [ax("duration", "Duration", { scale: "duration", values: ["30 min", "1 hour", "2 hours"] })],
    rows: [rec(t("rules", "Rules"))],
    x: { priceRule: "per-duration" }
  }),
  type("pens-pencils-markers", "Pens, pencils, markers", {
    dept: "stationery", cats: [...SHOPS, "supermarket-minimart"],
    axes: [ax("ink", "Ink colour", { display: "swatch", open: "colour", values: ["Blue", "Black", "Red", "Green"] }), ax("pack", "Pack count", { scale: "count", values: ["1", "5", "10", "12", "50"] })],
    rows: [req(c("kind", "Type", ["Ballpoint", "Gel", "Marker", "Pencil"])), rec(o("brand", "Brand")), rec(t("tip-size", "Tip size"))],
    x: { open: ["colour", "brand"] }
  }),
  type("notebooks-exercise-books", "Notebooks and exercise books", {
    dept: "stationery", cats: [...SHOPS, "supermarket-minimart"],
    axes: [ax("size", "Size", { scale: "paper-size", values: ["A4", "A5", "A6"] }), ax("pages", "Pages", { scale: "count", values: ["40", "80", "120", "200"] }), ax("ruling", "Ruling", { values: ["Ruled", "Squared", "Plain"] })],
    rows: [req(o("cover", "Cover")), rec(t("binding", "Binding")), rec(n("paper-weight", "Paper weight (gsm)")), rec(o("brand", "Brand"))],
    x: { open: ["cover", "brand"] }
  }),
  type("paper-reams", "Paper reams", {
    dept: "stationery", cats: SHOPS,
    axes: [ax("size", "Size", { scale: "paper-size", values: ["A4", "A3"] }), ax("weight", "Weight", { scale: "gsm", values: ["70 gsm", "80 gsm", "100 gsm"] })],
    rows: [req(n("sheets", "Sheets per ream")), req(o("brand", "Brand")), rec(t("colour", "Colour")), rec(t("finish", "Finish"))],
    x: BRAND
  }),
  type("envelopes-files-folders", "Envelopes, files and folders", {
    dept: "stationery", cats: SHOPS,
    axes: [ax("size", "Size", { values: ["DL", "C5", "C4"] }), colour(), ax("pack", "Pack count", { scale: "count", values: ["1", "10", "25", "50", "100"] })],
    rows: [req(o("material", "Material")), rec(o("colour-note", "Colour"))],
    x: { open: ["colour", "material"] }
  }),
  type("staplers-glue-tape-scissors", "Staplers, staples, glue, tape, scissors", {
    dept: "stationery", cats: [...SHOPS, "supermarket-minimart"],
    axes: [ax("kind", "Size or type", { display: "dropdown" }), ax("pack", "Pack count", { scale: "count", values: ["1", "2", "5", "10"] })],
    rows: [req(t("type-or-size", "Type or size")), rec(o("brand", "Brand"))],
    x: BRAND
  }),
  type("calculator", "Calculator", {
    dept: "stationery", cats: [...SHOPS, "electronics-computers", "supermarket-minimart"],
    rows: [req(c("kind", "Type", ["Basic", "Scientific", "Financial"])), req(o("brand", "Brand or model")), req(c("power", "Power", ["Solar", "Battery"])), rec(n("digits", "Display digits"))],
    x: BRAND
  })
];
