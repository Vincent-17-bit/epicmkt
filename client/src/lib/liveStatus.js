import { getUserTimeZone, statusOf } from "@epicmkt/shared";

export const withLiveStatus = (business, at) => {
  if (!business || !business.hours) return business;
  try {
    const status = statusOf(business.hours, business.exceptions ?? [], new Date(at), business.timezone, getUserTimeZone());
    return { ...business, isOpen: status.isOpen, statusLine: status.line, closesAt: status.closesAt, opensAt: status.opensAt, openStatus: status };
  } catch {
    return business;
  }
};
