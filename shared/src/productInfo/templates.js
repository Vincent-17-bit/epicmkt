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

const phone = {
  id: "phone",
  name: "Phone",
  groups: [
    {
      name: "Item details",
      rows: [
        text("brand", "Brand"),
        text("model-name", "Model name"),
        text("model-number", "Model number"),
        text("color", "Colour"),
        pick("condition", "Condition", ["New", "Refurbished", "Used", "Ex-UK", "Ex-Dubai"]),
        text("country-of-origin", "Country of origin")
      ]
    },
    {
      name: "Display",
      rows: [
        num("screen-size", "Screen size", "inches"),
        text("resolution", "Resolution"),
        pick("display-type", "Display type", ["LCD", "IPS LCD", "AMOLED", "Super AMOLED", "OLED"]),
        num("refresh-rate", "Refresh rate", "hertz")
      ]
    },
    {
      name: "Performance",
      rows: [
        pick("ram", "RAM", ["1 GB", "2 GB", "3 GB", "4 GB", "6 GB", "8 GB", "12 GB", "16 GB"]),
        pick("storage", "Storage", ["16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"]),
        text("processor", "Processor"),
        text("operating-system", "Operating system"),
        yesNo("memory-card-slot", "Memory card slot")
      ]
    },
    {
      name: "Camera",
      rows: [num("rear-camera", "Rear camera", "MP"), num("front-camera", "Front camera", "MP"), yesNo("flash", "Flash")]
    },
    {
      name: "Battery",
      rows: [
        num("battery-capacity", "Battery capacity", "mAh"),
        num("charging-power", "Charging power", "watts"),
        pick("charging-port", "Charging port", ["USB-C", "Micro USB", "Lightning"]),
        yesNo("wireless-charging", "Wireless charging")
      ]
    },
    {
      name: "Connectivity",
      rows: [
        pick("sim", "SIM", ["Single SIM", "Dual SIM", "eSIM and SIM"]),
        multi("network", "Network", ["2G", "3G", "4G", "5G"]),
        multi("connectivity-features", "Connectivity features", ["Wi-Fi", "Bluetooth", "NFC", "GPS", "Hotspot", "FM radio"]),
        multi("security", "Security", ["Fingerprint", "Face unlock", "PIN only"])
      ]
    },
    {
      name: "Warranty & Support",
      rows: [
        pick("warranty-period", "Warranty period", ["None", "1 month", "3 months", "6 months", "1 year", "2 years"]),
        text("in-the-box", "In the box"),
        text("return-policy", "Return policy")
      ]
    }
  ]
};

const water = {
  id: "water-point",
  name: "Water refill",
  groups: [
    {
      name: "Water details",
      rows: [
        pick("water-type", "Water type", ["Purified", "Spring", "Alkaline", "Mineral", "Distilled"]),
        pick("container-size", "Container size", ["5 L", "10 L", "18.9 L", "20 L", "Other"]),
        pick("refill-or-new", "Refill or new bottle", ["Refill", "New bottle", "Both"]),
        text("brand", "Brand")
      ]
    },
    {
      name: "Treatment and quality",
      rows: [
        multi("treatment", "Treatment", ["Reverse osmosis", "UV", "Carbon filter", "Chlorinated", "Ozonated"]),
        yesNo("kebs-certified", "KEBS certified"),
        text("last-tested", "Last quality test")
      ]
    },
    {
      name: "Ordering and delivery",
      rows: [
        yesNo("delivery", "Delivery available"),
        pick("subscription", "Delivery subscription", ["None", "Daily", "Weekly", "Monthly"]),
        text("minimum-order", "Minimum order"),
        yesNo("same-day", "Same-day delivery"),
        text("bottle-deposit", "Bottle deposit")
      ]
    }
  ]
};

const printing = {
  id: "custom-printing",
  name: "Printing and branding",
  groups: [
    {
      name: "Service details",
      rows: [
        pick("service-type", "Service type", ["Shirt and garment printing", "Document printing", "Banners and posters", "Business cards", "Mugs and gifts", "Embroidery", "Binding and lamination"]),
        multi("print-method", "Print method", ["Screen print", "Heat transfer", "DTF", "Sublimation", "Vinyl", "Embroidery", "Digital print"]),
        pick("print-colour", "Print colour", ["Black and white", "Full colour", "Both"]),
        text("print-areas", "Print areas", { placeholder: "Front, back, sleeve" })
      ]
    },
    {
      name: "Materials",
      rows: [
        multi("garments", "Items we print on", ["T-shirts", "Polo shirts", "Hoodies", "Caps", "Uniforms", "Aprons", "Bags"]),
        text("fabric", "Fabric"),
        text("sizes", "Sizes available"),
        text("colours", "Item colours"),
        text("paper-size-weight", "Paper size and weight")
      ]
    },
    {
      name: "Ordering",
      rows: [
        text("minimum-quantity", "Minimum quantity"),
        yesNo("design-service", "Design service"),
        yesNo("sample", "Sample before bulk order"),
        pick("turnaround", "Turnaround", ["While you wait", "Same day", "24 hours", "2 to 3 days", "A week or more"]),
        pick("fulfilment", "Pickup or delivery", ["Pickup", "Delivery", "Both"])
      ]
    }
  ]
};

const bakery = {
  id: "bakery-item",
  name: "Bakery and snacks",
  groups: [
    {
      name: "Product details",
      rows: [
        text("item-type", "Item type"),
        text("flavour", "Flavour"),
        text("weight-or-size", "Weight or size"),
        num("pieces", "Pieces per pack", "pieces"),
        text("ingredients", "Main ingredients")
      ]
    },
    {
      name: "Dietary and allergens",
      rows: [
        multi("dietary", "Dietary", ["Eggless", "Sugar-free", "Gluten-free", "Vegan", "Halal"]),
        multi("contains", "Contains", ["Nuts", "Dairy", "Gluten", "Eggs", "Soy"])
      ]
    },
    {
      name: "Freshness and storage",
      rows: [
        pick("baked", "Baked", ["Fresh today", "Baked to order", "Packed"]),
        text("shelf-life", "Shelf life"),
        text("storage", "Storage")
      ]
    },
    {
      name: "Ordering",
      rows: [
        yesNo("custom-orders", "Custom orders"),
        pick("lead-time", "Lead time", ["Ready now", "Same day", "24 hours", "3 days or more"]),
        multi("occasions", "Occasions", ["Birthday", "Wedding", "Graduation", "Office", "Everyday"]),
        yesNo("bulk-orders", "Bulk or event orders"),
        yesNo("delivery", "Delivery available")
      ]
    }
  ]
};

const packaged = {
  id: "packaged-goods",
  name: "Packaged goods",
  groups: [
    {
      name: "Product details",
      rows: [
        text("brand", "Brand"),
        text("product-type", "Product type"),
        text("variant", "Variant or scent"),
        text("pack-size", "Pack size", { placeholder: "1 kg, 500 ml, pack of 12" }),
        text("country-of-origin", "Country of origin")
      ]
    },
    {
      name: "Usage",
      rows: [
        multi("suitable-for", "Suitable for", ["Hand wash", "Machine wash", "Whites", "Coloured clothes", "Sensitive skin", "All surfaces"]),
        text("directions", "Directions for use"),
        text("key-ingredients", "Key ingredients")
      ]
    },
    {
      name: "Safety and storage",
      rows: [
        text("expiry", "Expiry or best before"),
        text("storage", "Storage"),
        yesNo("keep-from-children", "Keep away from children"),
        yesNo("kebs-marked", "KEBS marked")
      ]
    },
    {
      name: "Ordering",
      rows: [
        yesNo("wholesale", "Wholesale price available"),
        text("minimum-bulk", "Bulk quantity"),
        yesNo("delivery", "Delivery available")
      ]
    }
  ]
};

export const INFO_TEMPLATES = Object.freeze([speaker, phone, water, printing, bakery, packaged, goods, service]);
