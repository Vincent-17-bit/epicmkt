import { createMeasure } from "./measure.js";
import { num2str, roundTo } from "./util.js";

// Stored in GB so that 1024 GB and 1 TB are the same value (and the same sizeKey).
export default createMeasure({
  id: "storage",
  label: "Storage / memory",
  accepts: "number + MB, GB or TB (1 TB = 1024 GB)",
  display: "MB below 1 GB, TB from 1024 GB, otherwise GB: 512 MB, 128 GB, 1 TB, 2 TB",
  units: [
    { code: "MB", factor: 1 / 1024, words: ["mb", "megabyte", "megabytes", "mbs"] },
    { code: "GB", factor: 1, words: ["gb", "gigabyte", "gigabytes", "gig", "gigs", "gbs"] },
    { code: "TB", factor: 1024, words: ["tb", "terabyte", "terabytes", "tbs"] }
  ],
  min: 1 / 1024,
  max: 100 * 1024,
  canonicalize: (gb) => ({ value: roundTo(gb, 6), unit: "GB" }),
  toBaseAmount: (v) => v.value,
  formatBase(gb) {
    if (gb < 1) return `${num2str(gb * 1024)} MB`;
    if (gb >= 1024) return `${num2str(gb / 1024)} TB`;
    return `${num2str(gb)} GB`;
  },
  examples: { valid: ["128 GB", "128gb", "1 TB", "1tb", "1024 GB", "2048GB", "512 MB", "1.5 TB"], invalid: ["128", "abc", "5 kg", "0 GB", "-1 TB", "9999 TB"] }
});
