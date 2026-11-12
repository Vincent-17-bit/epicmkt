import { SHOE_SYSTEM_IDS } from "./scaleLabels.js";

// The buyer's shoe size system (EU, UK, US men, US women, cm), remembered on this device. No shop decides it: the buyer's choice wins,
// else the item's own default (`axis.system`, else the system its first value is written in), else EU.
export const SHOE_SYSTEM_KEY = "epicmkt-shoe-system";

export function readShoeSystem() {
  try {
    const v = localStorage.getItem(SHOE_SYSTEM_KEY);
    return SHOE_SYSTEM_IDS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveShoeSystem(system) {
  try {
    if (SHOE_SYSTEM_IDS.includes(system)) localStorage.setItem(SHOE_SYSTEM_KEY, system);
  } catch {}
}

export const chooseShoeSystem = (buyer, itemDefault) => (SHOE_SYSTEM_IDS.includes(buyer) ? buyer : SHOE_SYSTEM_IDS.includes(itemDefault) ? itemDefault : "eu");
