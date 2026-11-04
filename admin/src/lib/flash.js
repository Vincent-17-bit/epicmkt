import { formatKes } from "@epicmkt/shared";

// "20% off", "KES 200 off" or "Sale price KES 3,500": the same wording the demo data uses.
export function describeDiscount(type, value) {
  if (type === "percent") return `${Number(value)}% off`;
  if (type === "amount_off") return `${formatKes(value)} off`;
  return `Sale price ${formatKes(value)}`;
}
