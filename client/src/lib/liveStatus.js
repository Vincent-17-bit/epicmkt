import { statusOf } from "@epicmkt/shared";
import { shopperZone } from "./shopperZone.js";

export const withLiveStatus = (business, at) => {
  if (!business || !business.hours) return business;
  try {
    const status = statusOf(business.hours, business.exceptions ?? [], new Date(at), business.timezone, shopperZone());
    return { ...business, isOpen: status.isOpen, statusLine: status.line, closesAt: status.closesAt, opensAt: status.opensAt, openStatus: status };
  } catch {
    return business;
  }
};
