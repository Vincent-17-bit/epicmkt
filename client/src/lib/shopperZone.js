import { getUserTimeZone } from "@epicmkt/shared";

// The shopper's own time zone, for showing a shop's times on the shopper's clock as well. A device that says UTC (or GMT, Etc/...)
// is almost never a person's real clock: headless browsers, privacy browsers and some VPNs report it. For those the zone is unknown
// (null), so the page shows the shop's own time only and never a "UTC" label. A real zone (America/New_York, Europe/London) is kept,
// so shoppers abroad still see the shop's hours in their own time.
const MACHINE_ZONE = /^(?:UTC|UCT|GMT|Universal|Zulu|Greenwich|Etc\/.*)$/i;

export const isMachineZone = (zone) => typeof zone !== "string" || MACHINE_ZONE.test(zone);

export const shopperZone = (zone = getUserTimeZone()) => (isMachineZone(zone) ? null : zone);
