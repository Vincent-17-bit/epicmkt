const row = (key, label, input = "text") => ({ key, label, level: "recommended", input });

export const GENERIC_GOODS_TEMPLATE = Object.freeze({
  id: "generic-goods",
  specRows: Object.freeze([
    row("brand", "Brand", "openValue"),
    row("material", "Material", "openValue"),
    row("colour", "Colour", "openValue"),
    row("size", "Size"),
    row("weight", "Weight"),
    row("pack-size", "Pack size"),
    row("warranty", "Warranty"),
    row("country-of-origin", "Country of origin"),
    row("includes", "What is in the box")
  ])
});
