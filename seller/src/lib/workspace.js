import { useQuery } from "@tanstack/react-query";
import { limitsFor, planOf, teamCapabilities, canPair } from "@epicmkt/shared";
import { promo } from "../api/promo/index.js";

export const SITE_URL = (import.meta.env?.VITE_SITE_URL || "https://epicmkt.co.ke").replace(/\/$/, "");

export const useWorkspace = () => {
  const q = useQuery({ queryKey: ["workspace"], queryFn: () => promo.getWorkspace(), staleTime: 60000 });
  const business = q.data?.business ?? null;
  const plan = planOf(business?.plan_key);
  return {
    ...q,
    business,
    plan,
    premium: plan === "premium",
    limits: limitsFor(plan, q.data?.global),
    global: q.data?.global ?? null,
    readOnly: Boolean(business) && business.status !== "live",
    caps: teamCapabilities(plan, business?.category_id),
    pairs: canPair(business?.category_id),
  };
};

export const useUsage = () => useQuery({ queryKey: ["usage"], queryFn: () => promo.getUsage() });

export const useItems = () => useQuery({ queryKey: ["items"], queryFn: () => promo.listItems() });
