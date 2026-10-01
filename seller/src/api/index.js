import * as backend from "@epicmkt/backend";

export const getSellerBusiness = (sellerId) => backend.getSellerBusiness(sellerId);
export const getSellerStats = (sellerId) => backend.getSellerStats(sellerId);
export const updateSellerBusiness = (sellerId, patch) => backend.updateSellerBusiness(sellerId, patch);
export const getCategories = () => backend.getCategories();
