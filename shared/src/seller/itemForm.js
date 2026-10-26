import { STATUS_CHOICES, statusForForm } from "../availability.js";

export const ITEM_PRICE_TYPES = ["fixed", "from", "range", "free", "contact"];

const money = (raw) => {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (text === "") return { empty: true };
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return { error: true };
  const value = Number(text);
  return value > 9999999999.99 ? { error: true } : { value };
};

export const validateItemForm = (f) => {
  const errors = {};
  const name = String(f.name ?? "").trim();
  if (name.length < 2 || name.length > 120) errors.name = "Use 2 to 120 characters.";
  const description = String(f.description ?? "").trim();
  if (description.length > 2000) errors.description = "Use 2000 characters or fewer.";
  const section = String(f.section ?? "").trim();
  if (section.length > 60) errors.section = "Use 60 characters or fewer.";
  const unit = String(f.unit ?? "").trim();
  if (unit.length > 30) errors.unit = "Use 30 characters or fewer.";
  if (!ITEM_PRICE_TYPES.includes(f.priceType)) errors.priceType = "Choose a price type.";
  if (!STATUS_CHOICES.some((c) => c.key === f.availability)) errors.availability = "Choose availability.";

  // Counting stock is optional. When it is on, the count decides the status.
  const trackStock = Boolean(f.trackStock);
  let stockCount = null;
  let lowStockThreshold = 3;
  if (trackStock) {
    const count = String(f.stockCount ?? "").trim();
    if (!/^\d{1,6}$/.test(count)) errors.stockCount = "Enter how many you have, such as 12. Use 0 if none.";
    else stockCount = Number(count);
    const low = String(f.lowStockThreshold ?? "3").trim();
    if (!/^\d{1,4}$/.test(low)) errors.lowStockThreshold = "Enter a whole number, such as 3.";
    else lowStockThreshold = Number(low);
  }

  const price = money(f.price);
  const priceMax = money(f.priceMax);
  const sale = money(f.salePrice);
  let priceValue = null;
  let maxValue = null;
  let saleValue = null;
  if (["fixed", "from", "range"].includes(f.priceType)) {
    if (price.empty) errors.price = "Enter a price.";
    else if (price.error) errors.price = "Enter a number such as 1500.";
    else priceValue = price.value;
    if (f.priceType === "range") {
      if (priceMax.empty) errors.priceMax = "Enter the highest price.";
      else if (priceMax.error) errors.priceMax = "Enter a number such as 2500.";
      else if (priceValue !== null && priceMax.value < priceValue) errors.priceMax = "The highest price must not be below the lowest.";
      else maxValue = priceMax.value;
    }
    if (!sale.empty) {
      if (sale.error) errors.salePrice = "Enter a number such as 1200.";
      else if (priceValue !== null && sale.value >= priceValue) errors.salePrice = "The sale price must be below the regular price.";
      else saleValue = sale.value;
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, description, section, unit, priceType: f.priceType, price: priceValue, priceMax: maxValue, salePrice: saleValue, availability: f.availability, trackStock, stockCount, lowStockThreshold, showStockCount: trackStock && Boolean(f.showStockCount) } };
};

export const emptyItemForm = () => ({ name: "", description: "", section: "", unit: "", priceType: "fixed", price: "", priceMax: "", salePrice: "", availability: "available", trackStock: false, stockCount: "", lowStockThreshold: "3", showStockCount: false });

export const formFromItem = (i) => ({
  name: i.name, description: i.description ?? "", section: i.section ?? "", unit: i.unit ?? "", priceType: i.priceType,
  price: i.price === null || i.price === undefined ? "" : String(i.price), priceMax: i.priceMax === null || i.priceMax === undefined ? "" : String(i.priceMax),
  salePrice: i.salePrice === null || i.salePrice === undefined ? "" : String(i.salePrice),
  availability: STATUS_CHOICES.some((c) => c.key === statusForForm(i.availability)) ? statusForForm(i.availability) : "available",
  trackStock: Boolean(i.trackStock), stockCount: i.stockCount === null || i.stockCount === undefined ? "" : String(i.stockCount),
  lowStockThreshold: String(i.lowStockThreshold ?? 3), showStockCount: Boolean(i.showStockCount),
});
