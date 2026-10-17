import { formatKes } from "@epicmkt/shared";

const planName = (key) => (key === "premium" ? "Premium" : "Standard");

// Plain-language "who is affected" lines for one plan's pending edit. Returns [] when nothing changed.
export function describeImpact({ planKey, before, after, stats }) {
  if (!before || !after) return [];
  const live = stats?.liveBusinesses ?? 0;
  const pending = stats?.inProgressApplications ?? 0;
  const name = planName(planKey);
  const out = [];

  if (before.price !== after.price) {
    out.push(
      `Price ${formatKes(before.price)} to ${formatKes(after.price)}: applies to new applications and to renewals from the next billing date. ` +
        `${live} live ${name} ${live === 1 ? "business keeps" : "businesses keep"} the current price until their paid period ends; ` +
        `${pending} application${pending === 1 ? "" : "s"} in progress keep the price they were quoted.`,
    );
  }
  if (before.items !== after.items) {
    out.push(
      after.items < before.items
        ? `Item limit ${before.items} to ${after.items}: nothing is deleted. Any of the ${live} live ${name} businesses above ${after.items} items keep what they have but cannot add more.`
        : `Item limit ${before.items} to ${after.items}: all ${live} live ${name} businesses can add more items straight away.`,
    );
  }
  if (before.trialDays !== after.trialDays) {
    out.push(`Trial ${before.trialDays} to ${after.trialDays} days: applies to applications submitted after the save.`);
  }
  if (before.badge !== after.badge) out.push(`Badge changes on the public plan card straight away.`);
  if (JSON.stringify(before.topBenefits) !== JSON.stringify(after.topBenefits)) out.push(`Top benefits change on the public plan card straight away.`);
  return out;
}

export const isDirty = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
