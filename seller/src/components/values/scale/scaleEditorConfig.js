// What each scale's editor says and offers. The scale itself (parse, format, units, systems) always comes from @epicmkt/shared;
// this file holds only wording and which quick ranges to offer. No shop data.
export const UNIT_NAMES = { ml: "ml", l: "litres (L)", g: "grams (g)", kg: "kilograms (kg)", min: "minutes", h: "hours", day: "days", week: "weeks", month: "months", year: "years", w: "watts (W)", kw: "kilowatts (kW)", v: "volts (V)", k: "kelvin (K)" };

export const SCALE_EDITORS = {
  label: { title: "Choice", hint: "Refill, New bottle with water, Brown", examples: "Refill", noun: "choice" },
  count: { title: "Count", hint: "4, 3-seater, set of 6, pack of 12", examples: "3-seater" },
  volume: { title: "Volume", hint: "20 litres, 500 ml, 1.5 L", examples: "20 litres" },
  weight: { title: "Weight", hint: "22.5 kg, 500 g, 1 kg", examples: "22.5 kg" },
  duration: { title: "Duration", hint: "30 min, 1 hour, 3 months", examples: "90 min" },
  portion: { title: "Portion", hint: "small, regular, large, half plate, full plate", examples: "half plate" },
  voltage: { title: "Voltage", hint: "12 V, 24V, 230 V", examples: "12 V" },
  power: { title: "Power", hint: "9 W, 4.8 W, 1.5 kW", examples: "9 W" },
  "ip-rating": { title: "Water and dust protection", hint: "IP20, IP44, IP67", examples: "IP67" },
  "color-temperature": { title: "Colour temperature", hint: "3000 K warm white, 6500K", examples: "3000 K" }
};

const FT_IN = [{ id: "m", label: "m", raw: "m" }, { id: "cm", label: "cm", raw: "cm" }, { id: "mm", label: "mm", raw: "mm" }, { id: "ft", label: "ft", raw: "ft" }, { id: "in", label: "in", raw: "in" }];

// 1.5: measurement scales. `range` offers "from, to, step" with an optional choice of what follows each number (a unit word or a size system);
// `presets` fill many values with one tap.
Object.assign(SCALE_EDITORS, {
  "apparel-alpha": { title: "Clothing size", hint: "XS, S, M, L, XL, 2XL", examples: "M", presets: [
    { id: "xs-xl", label: "XS to XL", raws: ["XS", "S", "M", "L", "XL"] },
    { id: "s-3xl", label: "S to 3XL", raws: ["S", "M", "L", "XL", "2XL", "3XL"] },
    { id: "xs-5xl", label: "XS to 5XL", raws: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] }] },
  "apparel-numeric": { title: "Clothing size (numbers)", hint: "US 0 to 22: 6, 8, US 10", examples: "US 10", range: { defaults: { from: 4, to: 16, step: 2 }, label: "US sizes" } },
  "kids-age": { title: "Kids age", hint: "newborn, 6 months, 3 years, 3-4 years", examples: "3-4 years", presets: [
    { id: "baby", label: "Newborn to 24 months", raws: ["newborn", "3 months", "6 months", "12 months", "18 months", "24 months"] },
    { id: "kids", label: "2 to 8 years", raws: ["2 years", "3 years", "4 years", "5 years", "6 years", "7 years", "8 years"] }],
    range: { defaults: { from: 2, to: 8, step: 1 }, options: [{ id: "years", label: "years", raw: "years" }, { id: "months", label: "months", raw: "months" }] } },
  "collar-inch": { title: "Collar size", hint: "15, 15.5, 16 (inches, half steps)", examples: "15.5", range: { defaults: { from: 14, to: 18, step: 0.5 }, label: "inches" } },
  shoe: { title: "Shoe size", hint: "EU 42, UK 8, US 9, or 26.7 cm. Add a width such as “EU 42 wide”", examples: "EU 42", range: { defaults: { from: 38, to: 47, step: 0.5 }, bySystem: true } },
  "screen-inch": { title: "Screen size", hint: "6.7 in, 55\", 107 cm", examples: "6.7 in" },
  storage: { title: "Storage", hint: "128 GB, 512 GB, 1 TB", examples: "128 GB", presets: [
    { id: "phone", label: "64 GB to 1 TB", raws: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
    { id: "card", label: "16 GB to 256 GB", raws: ["16 GB", "32 GB", "64 GB", "128 GB", "256 GB"] }] },
  length: { title: "Length", hint: "2 m, 150 cm, 6 ft", examples: "2 m", range: { defaults: { from: 1, to: 5, step: 1 }, options: FT_IN } },
  "bed-size": { title: "Bed size", hint: "4 x 6, 5 x 6, 6 x 6 (feet)", examples: "6 x 6", presets: [
    { id: "common", label: "3 x 6 to 6 x 6 ft", raws: ["3 x 6", "4 x 6", "5 x 6", "6 x 6"] }] },
  "tyre-size": { title: "Tyre size", hint: "205/55 R16, 195/65R15", examples: "205/55 R16" },
  "paper-size": { title: "Paper size", hint: "A4, A3, A5", examples: "A4", presets: [
    { id: "a", label: "A6 to A3", raws: ["A6", "A5", "A4", "A3"] }] }
});

export const configFor = (scaleId) => SCALE_EDITORS[scaleId] ?? { title: scaleId, hint: "", examples: "" };
