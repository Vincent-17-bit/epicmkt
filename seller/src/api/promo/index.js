import * as live from "./live.js";
import * as mock from "./mock.js";

const impl = import.meta.env?.VITE_API_MODE === "live" ? live : mock;

export const PROMO_API = [
  "getWorkspace", "listItems", "getUsage", "listOffers", "saveOffer", "deleteOffer", "listFlash", "createFlash", "updateFlash", "deleteFlash",
  "uploadImage", "listGallery", "addGalleryPhoto", "updateGalleryPhoto", "softDeleteGallery", "restoreGallery", "purgeGallery", "reorderGallery",
  "listStaff", "saveStaff", "deleteStaff", "listSlots", "saveSlot", "deleteSlot", "publicUrl",
];

export const promo = Object.fromEntries(PROMO_API.map((name) => [name, (...a) => impl[name](...a)]));
export { resetPromoMock, readOverrides } from "./mock.js";
