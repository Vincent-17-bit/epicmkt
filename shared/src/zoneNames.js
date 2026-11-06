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
  "Asia/Calcutta": ["IST"],
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

const NAME_OFFSETS = {
  UTC: [0], EAT: [180], CAT: [120], WAT: [60], CET: [60], CEST: [120], EET: [120], EEST: [180], GMT: [0], BST: [60],
  SAST: [120], MSK: [180], GST: [240], PKT: [300], SGT: [480], HKT: [480], JST: [540], KST: [540], IST: [330, 60],
  EST: [-300], EDT: [-240], CST: [-360], CDT: [-300], MST: [-420], MDT: [-360], PST: [-480], PDT: [-420],
  AKST: [-540], AKDT: [-480], HST: [-600], AEST: [600], AEDT: [660], ACST: [570], ACDT: [630], AWST: [480],
  NZST: [720], NZDT: [780]
};

const isSummerTime = (date, zone) => {
  const year = date.getUTCFullYear();
  const now = tzOffsetMinutes(date, zone);
  return now > Math.min(tzOffsetMinutes(Date.UTC(year, 0, 1), zone), tzOffsetMinutes(Date.UTC(year, 6, 1), zone));
};

export function zoneAbbreviation(date, zone) {
  const names = ZONE_NAMES[zone];
  if (!names || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const name = names.length > 1 && isSummerTime(date, zone) ? names[1] : names[0];
  return NAME_OFFSETS[name]?.includes(tzOffsetMinutes(date, zone)) ? name : null;
}
