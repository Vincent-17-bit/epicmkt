import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../../../../api/index.js";
import { loadProductTypes, sellableTypes } from "../../AddItem.data.js";

// The product types this shop may sell (suggested for its category first, never locked to it), shared by the Add item page and the Type step.
export function useProductTypes() {
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const business = me.data?.business;
  const categoryId = business?.categoryId ?? "";
  const q = useQuery({ queryKey: ["productTypes", categoryId], queryFn: () => loadProductTypes({ categoryId }), enabled: Boolean(business), staleTime: 5 * 60_000, retry: 1 });
  const types = useMemo(() => sellableTypes(q.data?.types ?? [], categoryId), [q.data, categoryId]);
  return {
    business, categoryId, types,
    // The plan's caps on options ({ axes, values, variants }); undefined when the server does not send them, so the hard limits apply.
    planLimits: me.data?.limits?.[business?.planKey]?.options, departments: q.data?.departments ?? [],
    loading: me.isLoading || (Boolean(business) && q.isLoading),
    error: me.isError || q.isError,
    retry: () => { if (me.isError) me.refetch(); else q.refetch(); },
  };
}
