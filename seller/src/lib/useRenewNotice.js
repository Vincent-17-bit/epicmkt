import { useQuery } from "@tanstack/react-query";
import { billingBanners } from "@epicmkt/shared/billing";
import * as api from "../api/index.js";
import { now } from "./clock.js";

export const RENEW_NOTICES = ["expiring", "grace", "expired"];

/**
 * The renew reminder for the pages around Subscription: the subscription ends within 7 days, is in its grace days, or has
 * expired. Null otherwise, and for a suspended seller (the layout already says why the listing is hidden).
 * It reads the same cached subscription as the layout, so every page agrees on it.
 */
export function useRenewNotice() {
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const business = me.data?.business;
  if (!business || business.status === "suspended") return null;
  return billingBanners(business, now()).find((b) => RENEW_NOTICES.includes(b.id)) ?? null;
}
