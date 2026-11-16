import { EPOCH_GRACE, epochOf } from "./feed.js";

// The rotation hour this visit's feed uses (see lib/feed.js). Pinned when the visit starts and kept in the tab's session, so the
// order a visitor is paging through never reshuffles under them, through reloads and back-and-forth navigation. After a few
// hours, or in a new tab, the next visit picks up the current hour and so a fresh order.
//
// Storage can be missing or blocked (private mode, an embedded preview): then the value lives in memory for this page load.

export const FEED_EPOCH_KEY = "epicmkt.feedEpoch";
const KEEP_HOURS = 3;

let memory = null;

const read = () => {
  try {
    const raw = globalThis.sessionStorage?.getItem(FEED_EPOCH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Number.isInteger(parsed.epoch) && Number.isFinite(parsed.at) ? parsed : null;
  } catch {
    return null;
  }
};

const write = (value) => {
  try {
    globalThis.sessionStorage?.setItem(FEED_EPOCH_KEY, JSON.stringify(value));
  } catch {
    // blocked: the in-memory copy still holds for this page load
  }
};

/** The visit's rotation hour. The same value for the whole visit; a new one once the visit is older than a few hours. */
export function feedEpoch(now = Date.now()) {
  const current = epochOf(now);
  const kept = memory ?? read();
  const usable = kept && kept.epoch <= current && current - kept.epoch < Math.min(KEEP_HOURS, EPOCH_GRACE) && now - kept.at < KEEP_HOURS * 3_600_000;
  if (usable) {
    memory = kept;
    return kept.epoch;
  }
  memory = { epoch: current, at: now };
  write(memory);
  return current;
}

/** For tests: forget the pinned hour. */
export function resetFeedEpoch() {
  memory = null;
  try {
    globalThis.sessionStorage?.removeItem(FEED_EPOCH_KEY);
  } catch {
    // nothing to forget
  }
}
