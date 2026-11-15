// A25: electronics types. One entry per row of the A25 table.
// A type may carry at most four required rows, so where the table lists more, the options (storage, RAM, size, voltage ...)
// carry the first ones (they are always asked) and the rest are the four most important spec rows; the others are recommended.
import { ax, b, c, colour, n, o, rec, req, t, type, COMPUTER_SHOPS, ELECTRICAL_SHOPS, PHONE_SHOPS } from "./lib.mjs";

const brand = () => req(o("brand", "Brand"));
const condition = () => req(c("condition", "Condition", ["New", "Refurbished", "Used"]));
const warranty = () => req(t("warranty", "Warranty"));
const OPEN_BRAND_COLOUR = { open: ["brand", "colour"] };
const GB = (...v) => v.map((x) => (x >= 1024 ? `${x / 1024} TB` : `${x} GB`));
const connectivity = (extra = []) => c("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth", ...extra]);

export const ELECTRONICS = [
  type("phone", "Phone", {
    dept: "phones", cats: PHONE_SHOPS.concat("phone-repair"),
    axes: [colour(), ax("storage", "Storage", { scale: "storage", values: GB(64, 128, 256, 512) }), ax("ram", "RAM", { scale: "storage", values: GB(4, 6, 8, 12) })],
    rows: [brand(), req(t("model", "Model")), condition(), warranty(), rec(c("network", "Network", ["4G", "5G"])), rec(t("os", "OS")), rec(n("screen-size", "Screen size (inch)")), rec(n("battery", "Battery (mAh)")), rec(n("camera", "Camera (MP)")), rec(b("dual-sim", "Dual SIM")), rec(t("box-contents", "Box contents"))],
    x: { ...OPEN_BRAND_COLOUR, optionalAxes: ["style"] }
  }),
  type("tablet", "Tablet", {
    dept: "computers", cats: COMPUTER_SHOPS,
    axes: [colour(), ax("storage", "Storage", { scale: "storage", values: GB(32, 64, 128, 256) }), ax("ram", "RAM", { scale: "storage", values: GB(3, 4, 6, 8) })],
    rows: [brand(), req(t("model", "Model")), condition(), warranty(), rec(t("os", "OS")), rec(n("screen-size", "Screen size (inch)")), rec(n("battery", "Battery (mAh)")), rec(b("sim-support", "SIM support"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("laptop", "Laptop", {
    dept: "computers", cats: COMPUTER_SHOPS,
    axes: [colour(), ax("ram", "RAM", { scale: "storage", values: GB(4, 8, 16, 32) }), ax("storage", "Storage", { scale: "storage", values: GB(256, 512, 1024) })],
    rows: [brand(), req(t("model", "Model")), req(t("processor", "Processor")), condition(), rec(c("storage-type", "Storage type", ["SSD", "HDD"])), rec(n("screen-size", "Screen size (inch)")), rec(t("os", "OS")), rec(t("warranty", "Warranty")), rec(t("graphics", "Graphics")), rec(t("battery-life", "Battery life")), rec(n("weight", "Weight (kg)")), rec(t("keyboard-layout", "Keyboard layout")), rec(t("ports", "Ports"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("mouse-keyboard", "Mouse and keyboard", {
    dept: "computers", cats: COMPUTER_SHOPS,
    axes: [colour(), ax("layout", "Layout", { values: ["US", "UK", "Arabic", "French"] })],
    rows: [brand(), req(connectivity()), rec(t("battery-type", "Battery type")), rec(t("layout-note", "Layout"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("laptop-charger", "Laptop charger", {
    dept: "cables-power", cats: COMPUTER_SHOPS,
    axes: [ax("voltage", "Voltage", { scale: "voltage", values: ["12 V", "19 V", "20 V"] })],
    rows: [req(t("compatible-model", "Compatible laptop model")), req(t("output", "Output (V and A or W)")), req(t("tip-size", "Tip size")), req(t("connector", "Connector")), rec(c("original", "Original or compatible", ["Original", "Compatible"])), rec(n("cable-length", "Cable length (m)")), rec(t("input-voltage", "Input voltage"))],
    x: { open: ["brand"], compatRule: "model or output" }
  }),
  type("phone-charger", "Phone charger", {
    dept: "cables-power", cats: PHONE_SHOPS,
    axes: [colour(), ax("plug", "Plug type", { values: ["UK 3-pin", "EU 2-pin", "US 2-pin"] })],
    rows: [req(n("output", "Output (W)")), req(t("ports", "Ports (USB-A, USB-C)")), rec(t("fast-charge", "Fast-charge standard")), rec(b("cable-included", "Cable included"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("cable", "Cable", {
    dept: "cables-power", cats: [...PHONE_SHOPS, ...ELECTRICAL_SHOPS],
    axes: [ax("length", "Length", { scale: "length", values: ["0.5 m", "1 m", "2 m", "3 m"] }), colour()],
    rows: [req(t("connector-a", "Connector A")), req(t("connector-b", "Connector B")), rec(n("max-power", "Max power (W)")), rec(t("data-speed", "Data speed")), rec(b("braided", "Braided"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("power-adapter", "Power adapter (AC to DC)", {
    dept: "cables-power", cats: ELECTRICAL_SHOPS,
    axes: [ax("voltage", "Output voltage", { scale: "voltage", values: ["5 V", "9 V", "12 V", "19 V", "24 V"] })],
    rows: [req(n("current", "Current (A)")), req(n("plug-size", "Plug size (mm)")), req(t("input", "Input")), rec(t("polarity", "Polarity"))],
    x: { open: ["brand"] }
  }),
  type("travel-adapter", "Travel adapter", {
    dept: "cables-power", cats: [...PHONE_SHOPS, "supermarket-minimart"],
    rows: [req(t("input-plugs", "Input plug types")), req(t("output-plugs", "Output plug types")), req(t("max-load", "Max load")), rec(n("usb-ports", "Number of USB ports"))],
    x: { open: ["brand"] }
  }),
  type("extension-multi-plug", "Extension and multi-plug", {
    dept: "cables-power", cats: ELECTRICAL_SHOPS.concat("supermarket-minimart"),
    axes: [ax("cable_length", "Cable length", { scale: "length", values: ["1.5 m", "3 m", "5 m", "10 m"] }), ax("sockets", "Sockets", { scale: "count", values: ["3", "4", "5", "6", "8"] })],
    rows: [req(n("max-load", "Max load (A)")), req(c("surge-protection", "Surge protection", ["Yes", "No"])), rec(b("switch-per-socket", "Switch per socket"))],
    x: { open: ["brand"] }
  }),
  type("adapter-converter", "Adapter and converter (HDMI, VGA, USB-C hub)", {
    dept: "cables-power", cats: [...COMPUTER_SHOPS, ...PHONE_SHOPS],
    rows: [req(t("from-connector", "From connector")), req(t("to-connector", "To connector")), rec(t("max-resolution", "Maximum resolution"))],
    x: { open: ["brand"] }
  }),
  type("phone-case", "Phone case", {
    dept: "phones", cats: PHONE_SHOPS,
    axes: [colour(), ax("model", "Compatible model", { scale: "compat-model", open: "model" })],
    rows: [req(t("compatible-model", "Compatible model")), req(o("material", "Material")), rec(c("type", "Type", ["Soft", "Hard", "Wallet"]))],
    x: { open: ["material", "colour"], compat: { list: "phone-models", mode: "multi" } }
  }),
  type("screen-protector", "Screen protector", {
    dept: "phones", cats: PHONE_SHOPS,
    axes: [ax("model", "Compatible model", { scale: "compat-model", open: "model" })],
    rows: [req(t("compatible-model", "Compatible model")), req(c("kind", "Type", ["Tempered", "Hydrogel", "Privacy"])), req(t("finish", "Finish")), rec(n("pack-count", "Pack count"))],
    x: { compat: { list: "phone-models", mode: "multi" } }
  }),
  type("earphones-headphones", "Earphones, headphones", {
    dept: "electronics", cats: [...PHONE_SHOPS, "electronics-appliances"],
    axes: [colour()],
    rows: [brand(), req(c("kind", "Type", ["In-ear", "Over-ear", "True wireless"])), req(connectivity()), rec(t("battery-life", "Battery life")), rec(b("microphone", "Microphone")), rec(t("water-resistance", "Water resistance"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("speaker-soundbar", "Speaker and soundbar", {
    dept: "electronics", cats: ["electronics-appliances", "electronics-computers"],
    axes: [colour()],
    rows: [brand(), req(connectivity()), req(n("power-output", "Power output (W)")), rec(t("battery-life", "Battery life")), rec(t("ports", "Ports")), rec(b("remote", "Remote"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("tv", "TV", {
    dept: "electronics", cats: ["electronics-appliances", "electronics-computers"],
    axes: [ax("screen", "Screen size", { scale: "screen-inch", values: ["32 in", "43 in", "50 in", "55 in", "65 in"] })],
    rows: [brand(), req(t("model", "Model")), req(t("resolution", "Resolution")), req(c("smart", "Smart or not", ["Smart", "Not smart"])), rec(t("warranty", "Warranty")), rec(t("panel-type", "Panel type")), rec(t("ports", "Ports"))],
    x: { open: ["brand"] }
  }),
  type("power-bank", "Power bank", {
    dept: "cables-power", cats: PHONE_SHOPS,
    axes: [ax("capacity", "Capacity", { scale: "battery-capacity", values: ["5000 mAh", "10000 mAh", "20000 mAh", "30000 mAh"] }), colour()],
    rows: [req(n("output", "Output (W)")), req(t("ports", "Ports")), rec(t("input", "Input")), rec(b("cable-included", "Cable included"))],
    x: OPEN_BRAND_COLOUR
  }),
  type("memory-card", "Memory card and flash drive", {
    dept: "computers", cats: [...PHONE_SHOPS, "electronics-computers"],
    axes: [ax("style", "Style", { display: "text-card", values: ["Old Version", "New Version"] }), ax("capacity", "Capacity", { display: "text-card", scale: "storage", dependsOn: "style", values: GB(32, 64, 128, 256, 512, 1024, 2048) })],
    rows: [req(c("kind", "Type", ["microSD", "SD", "USB"])), req(t("speed", "Speed class or USB version")), rec(t("read-speed", "Read speed")), rec(t("compatible-devices", "Compatible devices"))],
    x: {
      open: ["brand"],
      // Which capacities exist per style (the Capacity list follows the Style, SanDisk example data).
      capacityByStyle: { "old-version": ["32-gb", "128-gb", "256-gb", "512-gb", "1-tb"], "new-version": ["64-gb", "128-gb", "256-gb", "512-gb", "1-tb", "2-tb"] }
    }
  }),
  type("led-bulb", "Bulb", {
    dept: "lighting", cats: ELECTRICAL_SHOPS,
    axes: [ax("wattage", "Wattage", { scale: "power", values: ["5 W", "9 W", "12 W", "15 W"] }), ax("temperature", "Colour temperature", { scale: "color-temperature", values: ["2700 K", "4000 K", "6500 K"] }), ax("pack", "Pack count", { scale: "count", values: ["1", "2", "4", "6"] })],
    rows: [req(c("kind", "Type", ["LED", "CFL"])), req(c("base", "Base", ["E27", "E14", "B22", "GU10", "MR16"])), req(t("voltage", "Voltage")), rec(n("lumens", "Lumens")), rec(b("dimmable", "Dimmable")), rec(n("lifespan", "Lifespan (hours)"))],
    x: { open: ["brand"] }
  }),
  type("light-fitting", "Light fitting (tube, ceiling, flood)", {
    dept: "lighting", cats: ELECTRICAL_SHOPS,
    axes: [ax("wattage", "Wattage", { scale: "power", values: ["10 W", "20 W", "36 W", "50 W"] }), ax("temperature", "Colour temperature", { scale: "color-temperature", values: ["3000 K", "4000 K", "6500 K"] })],
    rows: [req(c("fitting", "Fitting type", ["Tube", "Ceiling", "Flood", "Panel", "Wall"])), rec(t("ip-rating", "IP rating")), rec(n("length", "Length (cm)")), rec(b("dimmable", "Dimmable"))],
    x: { open: ["brand"] }
  }),
  type("led-strip", "LED strip light", {
    dept: "lighting", cats: ELECTRICAL_SHOPS,
    axes: [ax("length", "Length", { scale: "length", values: ["2 m", "5 m", "10 m"] }), ax("colour", "Light colour", { display: "swatch", values: ["Warm", "Cool", "RGB"] })],
    rows: [req(c("voltage", "Voltage", ["12 V", "24 V", "220 V"])), req(t("ip-rating", "IP rating")), rec(n("leds-per-metre", "LEDs per metre")), rec(b("power-supply", "Power supply included")), rec(b("remote", "Remote included")), rec(b("cuttable", "Cuttable")), rec(b("adhesive", "Adhesive backing"))],
    x: { open: ["brand"] }
  }),
  type("small-battery", "Small battery", {
    dept: "batteries", cats: [...ELECTRICAL_SHOPS, "supermarket-minimart"],
    axes: [ax("pack", "Pack count", { scale: "count", values: ["1", "2", "4", "8", "12"] })],
    rows: [req(c("size", "Size", ["AA", "AAA", "C", "D", "9 V", "CR2032", "Other"])), req(c("chemistry", "Chemistry", ["Alkaline", "Lithium", "Zinc carbon", "NiMH", "Li-ion"])), req(t("voltage", "Voltage")), rec(n("capacity", "Capacity (mAh)")), rec(o("brand", "Brand"))],
    x: { open: ["brand"] }
  }),
  type("large-battery", "Large battery (car, UPS, solar)", {
    dept: "batteries", cats: [...ELECTRICAL_SHOPS, "auto-spare-parts"],
    rows: [req(c("kind", "Type", ["Car", "UPS", "Solar", "Other"])), req(t("voltage", "Voltage")), req(n("capacity", "Capacity (Ah)")), req(t("terminal-layout", "Terminal layout")), rec(t("compatible-vehicle", "Compatible vehicle")), rec(n("cold-cranking", "Cold cranking amps")), rec(t("warranty", "Warranty")), rec(t("dimensions", "Dimensions"))],
    x: { open: ["brand"] }
  }),
  type("printer", "Printer", {
    dept: "printers-ink", cats: [...COMPUTER_SHOPS, "printing-stationery"],
    rows: [req(c("kind", "Type", ["Inkjet", "Laser", "Thermal"])), req(t("functions", "Functions (print, scan, copy)")), req(c("colour-mode", "Colour or mono", ["Colour", "Mono"])), req(connectivity(["USB"])), rec(condition()), rec(t("warranty", "Warranty")), rec(n("speed", "Speed (ppm)")), rec(t("paper-size", "Paper size")), rec(b("duplex", "Duplex"))],
    x: { open: ["brand"] }
  }),
  type("ink-toner", "Ink and toner", {
    dept: "printers-ink", cats: [...COMPUTER_SHOPS, "printing-stationery"],
    axes: [ax("colour", "Colour", { display: "swatch", values: ["Black", "Cyan", "Magenta", "Yellow"] }), ax("pack", "Pack", { values: ["Single", "Multipack"] })],
    rows: [req(t("compatible-printer", "Compatible printer model")), req(c("kind", "Kind", ["Original", "Compatible", "Refill"])), rec(n("yield", "Yield (pages)"))],
    x: { open: ["brand"] }
  }),
  type("router-extender", "Router and Wi-Fi extender", {
    dept: "computers", cats: COMPUTER_SHOPS,
    rows: [req(c("standard", "Standard", ["Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 7"])), req(t("speed", "Speed")), req(t("bands", "Bands")), rec(t("coverage", "Coverage")), rec(t("ports", "Ports"))],
    x: { open: ["brand"] }
  })
];
