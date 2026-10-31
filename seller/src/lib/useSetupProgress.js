import { useQuery } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { useSettings } from "../state/settings.js";
import { onboardingProgress } from "./onboarding.js";

// The setup checklist, worked out from the seller's real data. `ready` is false until everything it needs has loaded.
export function useSetupProgress() {
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const sub = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const stats = useQuery({ queryKey: ["catalog", "stats", "setup"], queryFn: () => api.catalogStats(), retry: false });
  const ready = loaded && Boolean(sub.data) && Boolean(stats.data);
  return { ready, settings, progress: onboardingProgress({ business: sub.data?.business, catalog: stats.data, settings }) };
}
