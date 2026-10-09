import * as backend from "@epicmkt/backend";
import * as live from "./live.js";
import * as mock from "./mock.js";

const impl = import.meta.env?.VITE_API_MODE === "live" ? live : mock;

export const getSellerBusiness = (sellerId) => backend.getSellerBusiness(sellerId);
export const getSellerStats = (sellerId) => backend.getSellerStats(sellerId);
export const updateSellerBusiness = (sellerId, patch) => backend.updateSellerBusiness(sellerId, patch);
export const getCategories = () => backend.getCategories();

export const login = (...a) => impl.login(...a);
export const logout = (...a) => impl.logout(...a);
export const me = (...a) => impl.me(...a);
export const forgotRequest = (...a) => impl.forgotRequest(...a);
export const forgotVerify = (...a) => impl.forgotVerify(...a);
export const requestOtp = (...a) => impl.requestOtp(...a);
export const changePassword = (...a) => impl.changePassword(...a);
export const updateProfile = (...a) => impl.updateProfile(...a);
export const requestChange = (...a) => impl.requestChange(...a);
export const cancelChange = (...a) => impl.cancelChange(...a);
export const listChanges = (...a) => impl.listChanges(...a);
export const confirmPrices = (...a) => impl.confirmPrices(...a);
export const replyFlag = (...a) => impl.replyFlag(...a);
export const markRead = (...a) => impl.markRead(...a);
export const pauseListing = (...a) => impl.pauseListing(...a);
export const requestDeletion = (...a) => impl.requestDeletion(...a);
export const catalogStats = (...a) => impl.catalogStats(...a);
export const itemSignals = (...a) => impl.itemSignals(...a);
export const finalizeMedia = (...a) => impl.finalizeMedia(...a);
export const exportData = (...a) => impl.exportData(...a);
export { ApiError } from "./errors.js";

export const dev = import.meta.env?.DEV && import.meta.env?.VITE_API_MODE !== "live" ? { simulate: mock.simulate, seededSellers: mock.seededSellers, devSignIn: mock.devSignIn, resetMock: mock.resetMock } : null;
