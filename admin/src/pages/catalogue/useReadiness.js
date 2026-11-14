import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import conformance from "../../data/conformanceResult.json";
import { readinessAll } from "../../lib/readiness.js";

// Loads what readiness needs and returns the result per category. The types and spec rules are optional: a role that cannot read them
// still sees the plans, conformance and preview checks, and the types check says "none" rather than failing the page.
export function useReadiness() {
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.listCategories() });
  const typeSettings = useQuery({ queryKey: ["admin-product-types"], queryFn: () => api.listTypeSettings(), retry: false });
  const specTypes = useQuery({ queryKey: ["admin-spec-types"], queryFn: () => api.listSpecTypes(), retry: false });
  const byId = useMemo(
    () => readinessAll({ categories: categories.data ?? [], types: typeSettings.data?.types ?? [], specTypes: specTypes.data ?? [], conformance }),
    [categories.data, typeSettings.data, specTypes.data]
  );
  return { categories, byId, typesUnavailable: typeSettings.isError || specTypes.isError, loading: categories.isLoading };
}
