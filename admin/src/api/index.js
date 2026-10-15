import { isLive } from "../lib/supabase.js";
import * as live from "./live.js";
import * as mock from "./mock.js";

// Both modules export the same functions. The mock is only chosen while VITE_SUPABASE_URL is empty.
const impl = isLive ? live : mock;

export const getAdminCounts = () => impl.getAdminCounts();
export const getDashboard = () => impl.getDashboard();
export const getNotifications = (options) => impl.getNotifications(options);
export const markNotificationsRead = (ids) => impl.markNotificationsRead(ids);
export const startReview = (applicationId) => impl.startReview(applicationId);
export const subscribeLive = (handlers) => impl.subscribeLive(handlers);
