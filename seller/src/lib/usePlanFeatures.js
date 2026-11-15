import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { planSwitches } from "@epicmkt/shared";
import * as api from "../api/index.js";

/**
 * Which features this shop's plan has: { options, threeD, recommend, delivery, demand } (true = on). A switch the admin turned off stops NEW use
 * of the feature (the database refuses it too); what the shop already has keeps working. Everything is on until the plan is known.
 */
export function usePlanFeatures() {
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const plan = me.data?.business?.planKey;
  return useMemo(() => planSwitches(plan, me.data?.limits ?? {}), [plan, me.data?.limits]);
}
