const kes = (value) => `KES ${Number(value).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

// "20% off", "KES 200 off" or "Sale price KES 3,500": the same wording the demo data uses.
export function describeDiscount(type, value) {
  if (type === "percent") return `${Number(value)}% off`;
  if (type === "amount_off") return `${kes(value)} off`;
  return `Sale price ${kes(value)}`;
}
