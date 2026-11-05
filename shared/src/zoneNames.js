import { BUSINESS_TIME_ZONE, tzOffsetMinutes } from "./time.js";

const EAT = ["EAT"];
const CAT = ["CAT"];
const WAT = ["WAT"];
const CET = ["CET", "CEST"];
const EET = ["EET", "EEST"];

export const ZONE_NAMES = {
  "UTC": ["UTC"],
  [BUSINESS_TIME_ZONE]: EAT,
  "Africa/Kampala": EAT,
  "Africa/Dar_es_Salaam": EAT,
  "Africa/Addis_Ababa": EAT,
  "Africa/Mogadishu": EAT,
  "Africa/Lagos": WAT,
  "Africa/Kinshasa": WAT,
  "Africa/Accra": ["GMT"],
  "Africa/Harare": CAT,
  "Africa/Lusaka": CAT,
  "Africa/Maputo": CAT,
  "Africa/Kigali": CAT,
  "Africa/Johannesburg": ["SAST"],
  "Africa/Cairo": EET,
  "Europe/London": ["GMT", "BST"],
  "Europe/Dublin": ["GMT", "IST"],
  "Europe/Paris": CET,
  "Europe/Berlin": CET,
  "Europe/Madrid": CET,
  "Europe/Rome": CET,
  "Europe/Amsterdam": CET,
  "Europe/Athens": EET,
  "Europe/Moscow": ["MSK"],
  "Asia/Dubai": ["GST"],
  "Asia/Karachi": ["PKT"],
  "Asia/Kolkata": ["IST"],
  "Asia/Singapore": ["SGT"],
  "Asia/Hong_Kong": ["HKT"],
  "Asia/Tokyo": ["JST"],
  "Asia/Seoul": ["KST"],
  "America/New_York": ["EST", "EDT"],
  "America/Toronto": ["EST", "EDT"],
  "America/Chicago": ["CST", "CDT"],
  "America/Denver": ["MST", "MDT"],
  "America/Phoenix": ["MST"],
  "America/Los_Angeles": ["PST", "PDT"],
  "America/Vancouver": ["PST", "PDT"],
  "America/Anchorage": ["AKST", "AKDT"],
  "Pacific/Honolulu": ["HST"],
  "Australia/Sydney": ["AEST", "AEDT"],
  "Australia/Melbourne": ["AEST", "AEDT"],
  "Australia/Brisbane": ["AEST"],
  "Australia/Adelaide": ["ACST", "ACDT"],
  "Australia/Perth": ["AWST"],
  "Pacific/Auckland": ["NZST", "NZDT"]
};

const isSummerTime = (date, zone) => {
  const year = date.getUTCFullYear();
  const now = tzOffsetMinutes(date, zone);
  return now > Math.min(tzOffsetMinutes(Date.UTC(year, 0, 1), zone), tzOffsetMinutes(Date.UTC(year, 6, 1), zone));
};

export function zoneAbbreviation(date, zone) {
  const names = ZONE_NAMES[zone];
  if (!names || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return names.length > 1 && isSummerTime(date, zone) ? names[1] : names[0];
}
