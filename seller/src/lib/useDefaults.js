import { useMemo } from "react";
import { useSession } from "../state/session.js";
import { useSettings } from "../state/settings.js";
import { closureReasons, newItemDefaults, partialClosureMessage, showClosesChip, staleDays, whatsappGreeting } from "./defaults.js";

// One place for screens to read the seller's saved defaults, with safe fallbacks until they load.
export function useDefaults() {
  const settings = useSettings((s) => s.settings);
  const business = useSession((s) => s.me?.business);
  return useMemo(() => ({
    settings,
    itemDefaults: newItemDefaults(settings, business),
    closureReasons: closureReasons(settings),
    partialMessage: partialClosureMessage(settings),
    showClosesChip: showClosesChip(settings),
    staleDays: staleDays(settings),
    greeting: (vars) => whatsappGreeting(settings, vars)
  }), [settings, business]);
}
