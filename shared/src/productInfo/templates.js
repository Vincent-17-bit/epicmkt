const text = (key, label, extra = {}) => ({ key, label, input: "text", ...extra });
const num = (key, label, unit, extra = {}) => ({ key, label, input: "number", unit, ...extra });
const pick = (key, label, choices, extra = {}) => ({ key, label, input: "choice", choices, ...extra });
const multi = (key, label, choices, extra = {}) => ({ key, label, input: "multi", choices, ...extra });
const yesNo = (key, label) => ({ key, label, input: "boolean" });

const speaker = {
  id: "speaker",
  name: "Speaker",
  groups: [
    {
      name: "Additional details",
      rows: [
        text("audio-output-mode", "Audio output mode"),
        pick("mounting-type", "Mounting type", ["Freestanding", "Wall mount", "Ceiling mount", "Shelf"]),
        text("enclosure-material", "Enclosure material"),
        pick("speaker-type", "Speaker type", ["Soundbar", "Soundbar with subwoofer", "Bookshelf", "Tower", "Portable", "Subwoofer", "Home theatre system", "PA speaker", "Party speaker"]),
        multi("additional-features", "Additional features", ["Bass boost", "Designed for gaming", "RGB lighting", "Karaoke input", "Microphone input", "Voice assistant", "Multi-room"]),
        num("subwoofer-diameter", "Subwoofer diameter", "inches"),
        text("color", "Color"),
        yesNo("is-waterproof", "Is waterproof"),
        pick("warranty-type", "Warranty type", ["Limited warranty", "Manufacturer warranty", "Shop warranty", "No warranty"]),
        num("maximum-range", "Maximum range", "metres"),
        multi("control-method", "Control method", ["Push button", "Remote", "Touch", "Mobile app", "Voice"]),
        num("speaker-size", "Speaker size", "inches"),
        num("woofer-diameter", "Woofer diameter", "inches"),
        num("tweeter-diameter", "Tweeter diameter", "inches"),
        pick("water-resistance-level", "Water resistance level", ["Not water resistant", "Splash resistant", "IPX4", "IPX5", "IPX7"]),
        num("bluetooth-range", "Bluetooth range", "metres"),
        num("audio-latency", "Audio latency", "milliseconds"),
        multi("specific-uses", "Specific uses for product", ["Gaming", "Home theatre", "Music listening", "Outdoor", "Church and events", "Office"])
      ]
    },
    {
      name: "Measurements",
      rows: [
        num("unit-count", "Unit count", "count"),
        text("dimensions", "Item dimensions D x W x H", { placeholder: "9 x 40 x 9 cm" }),
        num("item-weight", "Item weight", "kg")
      ]
    },
    {
      name: "Compatibility",
      rows: [multi("compatible-devices", "Compatible devices", ["Television", "Smartphone", "PC", "Laptop", "Gaming console", "Projector", "Tablet", "Decoder"])]
    },
    {
      name: "Power Source",
      rows: [pick("power-source", "Power source", ["Corded electric", "Battery powered", "Rechargeable battery", "USB powered", "Solar"])]
    },
    {
      name: "Item details",
      rows: [
        text("brand", "Brand"),
        text("model-name", "Model name"),
        text("model-number", "Model number"),
        text("manufacturer", "Manufacturer"),
        text("country-of-origin", "Country of origin"),
        text("included-components", "Included components")
      ]
    },
    {
      name: "Power",
      rows: [
        num("max-output-power", "Speaker maximum output power", "watts"),
        num("power-levels", "Number of power levels", ""),
        num("voltage", "Voltage", "volts"),
        num("battery-life", "Battery life", "hours"),
        num("charging-time", "Charging time", "hours")
      ]
    },
    {
      name: "Sound Quality",
      rows: [
        num("frequency-response", "Frequency response", "hertz"),
        pick("audio-channels", "Number of audio channels", ["1.0", "2.0", "2.1", "3.1", "5.1", "7.1"]),
        num("impedance", "Impedance", "ohm"),
        num("signal-to-noise", "Signal-to-noise ratio", "db")
      ]
    },
    {
      name: "Connectivity",
      rows: [
        multi("connectivity-technology", "Connectivity technology", ["Auxiliary", "Bluetooth", "HDMI", "Optical", "USB", "Wi-Fi", "RCA", "Coaxial", "SD card", "FM radio"]),
        multi("wireless-technology", "Wireless technology", ["Bluetooth", "Wi-Fi", "NFC", "FM"]),
        pick("subwoofer-connectivity", "Subwoofer connectivity technology", ["Wired", "Wireless", "Built in"]),
        multi("connectivity-protocol", "Connectivity protocol", ["Bluetooth", "HDMI", "Auxiliary", "Optical", "USB", "Wi-Fi"])
      ]
    },
    {
      name: "Audio Hardware",
      rows: [
        pick("audio-driver-type", "Audio driver type", ["Bass driver", "Full range", "Woofer and tweeter", "Passive radiator"]),
        num("audio-driver-size", "Audio driver size", "inches"),
        num("number-of-circuits", "Number of circuits", "")
      ]
    },
    {
      name: "Warranty & Support",
      rows: [
        pick("warranty-period", "Warranty period", ["None", "3 months", "6 months", "1 year", "2 years"]),
        text("return-policy", "Return policy"),
        text("support-contact", "Support contact")
      ]
    }
  ]
};

const goods = {
  id: "general-product",
  name: "General product",
  groups: [
    {
      name: "Item details",
      rows: [
        text("brand", "Brand"),
        text("model-name", "Model name"),
        text("model-number", "Model number"),
        text("material", "Material"),
        text("color", "Colour"),
        text("size", "Size"),
        text("country-of-origin", "Country of origin"),
        text("manufacturer", "Manufacturer")
      ]
    },
    {
      name: "Measurements",
      rows: [
        text("dimensions", "Dimensions L x W x H", { placeholder: "30 x 20 x 10 cm" }),
        num("item-weight", "Item weight", "kg"),
        num("unit-count", "Unit count", "count"),
        text("pack-contents", "Pack contents")
      ]
    },
    {
      name: "Additional details",
      rows: [
        pick("condition", "Condition", ["New", "Refurbished", "Used", "Mitumba"]),
        pick("authenticity", "Authenticity", ["Original", "Inspired", "Compatible"]),
        text("special-features", "Special features"),
        text("care-instructions", "Care instructions"),
        text("shelf-life", "Shelf life or expiry"),
        yesNo("installation-available", "Installation available")
      ]
    },
    {
      name: "Warranty & Support",
      rows: [
        pick("warranty-period", "Warranty period", ["None", "1 month", "3 months", "6 months", "1 year", "2 years"]),
        text("return-policy", "Return policy"),
        text("support-contact", "Support contact")
      ]
    }
  ]
};

const service = {
  id: "general-service",
  name: "General service",
  groups: [
    {
      name: "Service details",
      rows: [
        text("service-type", "Service type"),
        text("duration", "Typical duration"),
        text("price-basis", "Price basis", { placeholder: "Per hour, per room, per item" }),
        pick("booking", "Booking", ["Walk-in", "Appointment", "Both"]),
        text("lead-time", "Lead time")
      ]
    },
    {
      name: "Coverage",
      rows: [
        text("area-served", "Area served"),
        yesNo("home-service", "Home or on-site service"),
        text("travel-cost", "Travel cost"),
        text("opening-days", "Days available")
      ]
    },
    {
      name: "Credentials",
      rows: [
        yesNo("licensed", "Licensed or registered"),
        text("licence-number", "Licence or registration number"),
        num("experience", "Experience", "years"),
        text("languages", "Languages spoken")
      ]
    },
    {
      name: "What is included",
      rows: [
        yesNo("materials-included", "Materials included"),
        yesNo("free-quote", "Free quote or consultation"),
        text("warranty-on-work", "Warranty on work"),
        text("extras", "Extras")
      ]
    }
  ]
};

export const INFO_TEMPLATES = Object.freeze([speaker, goods, service]);
