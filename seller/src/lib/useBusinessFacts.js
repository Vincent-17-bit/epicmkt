import { useQuery } from "@tanstack/react-query";
import * as api from "../api/index.js";

export const FACTS_KEY = ["business-facts"];

// The business columns the settings and setup screens read (seller_id, plan_key, phone, email, logo_path...), as the database names them.
export function useBusinessFacts() {
  return useQuery({ queryKey: FACTS_KEY, queryFn: api.getBusinessFacts, retry: false });
}
