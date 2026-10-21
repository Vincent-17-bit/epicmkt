import { ApiError } from "./errors.js";

let settings = { graceDays: 1, strikeThreshold: 3, smsSender: "EpicMKT", quietStart: "21:00", quietEnd: "07:00" };

const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export async function getSettings() {
  await wait();
  return { ...settings };
}

export async function saveSettings(next) {
  await wait();
  const graceDays = Number(next.graceDays);
  const strikeThreshold = Number(next.strikeThreshold);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) throw new ApiError("invalid_grace_days");
  if (!Number.isInteger(strikeThreshold) || strikeThreshold < 1 || strikeThreshold > 20) throw new ApiError("invalid_strike_threshold");
  if (!/^[A-Za-z0-9]{3,11}$/.test(String(next.smsSender ?? "").trim())) throw new ApiError("invalid_sms_sender");
  if (!TIME.test(next.quietStart) || !TIME.test(next.quietEnd) || next.quietStart === next.quietEnd) throw new ApiError("invalid_quiet_hours");
  settings = { graceDays, strikeThreshold, smsSender: next.smsSender.trim(), quietStart: next.quietStart, quietEnd: next.quietEnd };
  return { ...settings };
}

export async function setBusinessGrace({ days }) {
  await wait();
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 90)) throw new ApiError("invalid_grace_days");
  return { graceDays: days, effective: days ?? settings.graceDays };
}
