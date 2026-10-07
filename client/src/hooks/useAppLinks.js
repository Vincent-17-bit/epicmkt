import { useQuery } from "@tanstack/react-query";
import { getSiteConfig } from "../api/siteConfig.js";
import { resolveAppLinks } from "../lib/appLinks.js";

export function useAppLinks() {
  const { data, isPending } = useQuery({
    queryKey: ["site-config"],
    queryFn: getSiteConfig,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
  return { ...resolveAppLinks(data), ready: !isPending };
}
