import { formatDateTime, getUserTimeZone, localInputToUtcIso, utcToLocalInput, zoneLabel } from "@epicmkt/shared";

// Times are stored and sent as UTC. A seller types and reads them in their own time zone, so a sale set for 09:00 starts
// at 09:00 wherever they are, and daylight saving is handled by the zone rules, not by us.
export const stamp = (iso) => `${formatDateTime(iso)} ${zoneLabel(iso)}`;
export const toLocalInput = (ms) => utcToLocalInput(ms, getUserTimeZone());
export const fromLocalInput = (value) => localInputToUtcIso(value, getUserTimeZone());
