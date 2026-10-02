import { PLAN_FEATURES, isValidPhoneKE, isOpenNow } from "@epicmkt/shared";
import { store } from "../store.js";
import { delay } from "../latency.js";
import { NotFoundError, ValidationError } from "../errors.js";

const findBySeller = (sellerId) => {
  const business = store.businesses.find((b) => b.sellerId === sellerId);
  if (!business) throw new NotFoundError("Seller has no listing");
  return business;
};

const EDITABLE = [
  "tagline", "description", "phone", "whatsapp", "email", "address", "area",
  "hours", "tags", "services", "socials", "gallery", "coverUrl", "logoUrl"
];

const isImageRef = (value) => value === null || value === "" || /^(https?:\/\/|\/)/.test(value);

export async function getSellerBusiness(sellerId) {
  await delay();
  const business = findBySeller(sellerId);
  return {
    ...business,
    planFeatures: PLAN_FEATURES[business.plan],
    isOpen: isOpenNow(business.hours)
  };
}

export async function getSellerStats(sellerId) {
  await delay();
  const business = findBySeller(sellerId);
  const since = Date.now() - 14 * 86400000;
  const recent = store.events.filter((e) => e.businessId === business.id && Date.parse(e.at) >= since);
  return {
    totals: { ...business.stats },
    recent: recent.length,
    plan: business.plan,
    status: business.status,
    planExpiresAt: business.planExpiresAt
  };
}

export async function updateSellerBusiness(sellerId, patch) {
  await delay();
  const business = findBySeller(sellerId);
  const features = PLAN_FEATURES[business.plan];
  const fields = {};

  for (const key of Object.keys(patch)) {
    if (!EDITABLE.includes(key)) throw new ValidationError(`Field not editable: ${key}`, { [key]: "Not editable" });
  }
  for (const key of ["phone", "whatsapp"]) {
    if (key in patch && !isValidPhoneKE(patch[key])) fields[key] = "Enter a valid Kenyan number";
  }
  for (const key of ["coverUrl", "logoUrl"]) {
    if (key in patch && !isImageRef(patch[key])) fields[key] = "Enter a valid image link";
  }
  if ("socials" in patch && !features.socials && Object.keys(patch.socials).length) {
    fields.socials = "Social links need the Premium plan";
  }
  if ("gallery" in patch && patch.gallery.length > features.maxGallery) {
    fields.gallery = `Your plan allows up to ${features.maxGallery} photos`;
  }
  if (Object.keys(fields).length) throw new ValidationError("Please fix the highlighted fields", fields);

  Object.assign(business, patch);
  return getSellerBusiness(sellerId);
}
