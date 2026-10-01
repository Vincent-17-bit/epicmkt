import * as admin from "@epicmkt/admin-backend";

export const getOverview = () => admin.getOverview();
export const listBusinesses = (params) => admin.listBusinesses(params);
export const setBusinessStatus = (id, status) => admin.setBusinessStatus(id, status);
export const setBusinessPlan = (id, plan) => admin.setBusinessPlan(id, plan);
export const extendPlan = (id, months) => admin.extendPlan(id, months);
export const getCategories = () => admin.getCategories();
export const getSellerBusiness = (sellerId) => admin.getSellerBusiness(sellerId);
