// Demo sound and TV products for the electronics shops: options with colour swatches, a full set of photos per product,
// three short videos on one of them, and specs a search filter can read (power, battery life, water resistance, connectivity).
// Only the demo backend uses this file.
import { productPictures } from "./productArt.js";

const COLOURS = {
  black: { label: "Black", color: "#1f2328" },
  blue: { label: "Blue", color: "#2457a6" },
  red: { label: "Red", color: "#b42318" },
  grey: { label: "Grey", color: "#8a8f98" },
  pink: { label: "Pink", color: "#e9a3b4" },
  teal: { label: "Teal", color: "#14857f" },
  white: { label: "White", color: "#e9e9ea" },
  camo: { label: "Camo", color: "#4b5a3a" },
  sand: { label: "Sandstone", color: "#cbbfa8" },
  brown: { label: "Brown", color: "#5a3b2a" }
};

const CAPTIONS = { front: "Front", angle: "Three-quarter view", side: "Side", detail: "Controls close-up", size: "Size and weight", outdoor: "Outdoors" };

// Photos for every colour: the first colour's photos come first, so the cover is the default colour. Each colour's front photo
// is the one its swatch jumps to.
function picturesFor({ shape, brand, colours, size, name }) {
  const images = [];
  const valueMedia = {};
  colours.forEach((key, ci) => {
    const set = productPictures({ shape, color: COLOURS[key].color, brand, size, name, captionOf: (k) => `${COLOURS[key].label}: ${CAPTIONS[k]}` });
    // The first colour gets the whole set; the others get front, angle and side, which is what a seller usually uploads.
    const kept = ci === 0 ? set : set.slice(0, 3);
    kept.forEach((img, i) => images.push({ ...img, id: `${key}-${i + 1}` }));
    valueMedia[key] = `${key}-1`;
  });
  return { images, valueMedia };
}

function speaker({ name, brand, shape, price, colours, specs, highlights, description, short, size, extraAxis = null, priceOf = null, videos = [], section = "Speakers", stock = 6 }) {
  const { images, valueMedia } = picturesFor({ shape, brand, colours, size, name });
  const colourAxis = { key: "colour", label: "Colour", display: "swatch", values: colours.map((k) => ({ id: k, label: COLOURS[k].label, color: COLOURS[k].color, mediaId: valueMedia[k] })) };
  const axes = extraAxis ? [colourAxis, extraAxis] : [colourAxis];
  const combos = extraAxis ? colours.flatMap((c) => extraAxis.values.map((v) => ({ colour: c, [extraAxis.key]: v.id }))) : colours.map((c) => ({ colour: c }));
  const optionVariants = combos.map((choice, i) => ({
    choice,
    price: priceOf ? priceOf(choice) : price,
    stock: (stock + i * 3) % 13 === 0 ? 2 : (stock + i * 3) % 13,
    status: (stock + i * 3) % 13 === 0 ? "limited_stock" : "available"
  }));
  return {
    name, brand, section, priceKes: price, description, shortDescription: short,
    highlights, specs: specs.map(([label, value]) => ({ group: "Features & Specs", label, value })),
    images, videos, imageUrl: images[0].url,
    optionAxes: axes, optionVariants, optionDefault: combos[0]
  };
}

// Three short demo clips (served by the client from /demo-media). Posters are the product's own photos.
const flipVideos = (posterOf) => [
  { id: "v1", url: "/demo-media/flip-overview.mp4", caption: "JBL Flip 6: Overview", poster: posterOf(0), duration: 8, by: "JBL" },
  { id: "v2", url: "/demo-media/flip-colours.mp4", caption: "JBL Flip 6: Colours", poster: posterOf(1), duration: 8, by: "JBL" },
  { id: "v3", url: "/demo-media/flip-outdoors.mp4", caption: "JBL Flip 6: Outdoors", poster: posterOf(5), duration: 8, by: "Nakuru Electronics Centre" }
];

const flip = speaker({
  name: "JBL Flip 6 portable Bluetooth speaker, waterproof",
  brand: "JBL",
  shape: "cylinder",
  price: 14500,
  colours: ["black", "blue", "red", "grey", "pink", "teal", "camo"],
  short: "Up to 12 hours playtime, IP67 dustproof and waterproof, PartyBoost to pair two speakers",
  description: "Bold sound in a speaker you can throw in a bag. Up to 12 hours of playtime, IP67 dust and water protection, and PartyBoost to pair two speakers for stereo.",
  highlights: ["Up to 12 hours playtime", "IP67 waterproof and dustproof", "PartyBoost pairing", "USB-C charging"],
  specs: [["Brand", "JBL"], ["Speaker maximum output power", "30 W"], ["Battery life", "12 hours"], ["Water resistance", "IP67 waterproof"], ["Connectivity", "Bluetooth 5.1, USB-C"], ["Audio output mode", "Stereo"], ["Weight", "0.55 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
  size: { l: "178 mm", h: "68 mm", d: "72 mm deep", weight: "0.55 KG" },
  stock: 9
});
flip.videos = flipVideos((i) => flip.images[i]?.url ?? flip.images[0].url);

export const AUDIO_PRODUCTS = [
  flip,
  speaker({
    name: "JBL Charge 5 Bluetooth speaker with built-in power bank",
    brand: "JBL", shape: "capsule", price: 22500, colours: ["black", "blue", "red", "teal", "camo"],
    short: "Up to 20 hours playtime, IP67 waterproof, charges your phone from the speaker",
    description: "A bigger, louder JBL that also charges your phone. Up to 20 hours of playtime and IP67 protection for the beach or the pool.",
    highlights: ["Up to 20 hours playtime", "Built-in power bank", "IP67 waterproof", "PartyBoost"],
    specs: [["Brand", "JBL"], ["Speaker maximum output power", "40 W"], ["Battery life", "20 hours"], ["Water resistance", "IP67 waterproof"], ["Connectivity", "Bluetooth 5.1, USB-C"], ["Audio output mode", "Stereo"], ["Weight", "0.96 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: { l: "223 mm", h: "94 mm", d: "97 mm deep", weight: "0.96 KG" }, stock: 7
  }),
  speaker({
    name: "JBL PartyBox 110 party speaker with light show",
    brand: "JBL", shape: "tower", price: 48500, colours: ["black"],
    short: "160 W sound, built-in light show, mic and guitar inputs, up to 12 hours",
    description: "A party speaker with a light show that follows the beat, mic and guitar inputs for karaoke, and up to 12 hours on battery.",
    highlights: ["160 W output", "Light show", "Mic and guitar inputs", "Splash-proof IPX4"],
    specs: [["Brand", "JBL"], ["Speaker maximum output power", "160 W"], ["Battery life", "12 hours"], ["Water resistance", "IPX4 splash-proof"], ["Connectivity", "Bluetooth, USB, Auxiliary 3.5 mm, RCA"], ["Audio output mode", "Stereo"], ["Weight", "10.9 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: { l: "280 mm", h: "568 mm", d: "283 mm deep", weight: "10.9 KG" }, stock: 3
  }),
  speaker({
    name: "Bose SoundLink Flex Bluetooth speaker (2nd gen)",
    brand: "Bose", shape: "puck", price: 21000, colours: ["black", "sand", "blue", "white"],
    short: "Clear, deep sound, IP67 waterproof and dustproof, up to 12 hours battery",
    description: "Small speaker, big sound. It floats, it is IP67 waterproof and dustproof, and it plays for up to 12 hours.",
    highlights: ["Up to 12 hours battery", "IP67 waterproof", "Floats in water", "Built-in microphone"],
    specs: [["Brand", "Bose"], ["Speaker maximum output power", "20 W"], ["Battery life", "12 hours"], ["Water resistance", "IP67 waterproof"], ["Connectivity", "Bluetooth 5.3, USB-C"], ["Audio output mode", "Mono"], ["Weight", "0.6 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: { l: "201 mm", h: "90 mm", d: "52 mm deep", weight: "0.6 KG" }, stock: 5
  }),
  speaker({
    name: "Sony SRS-XB100 compact Bluetooth speaker",
    brand: "Sony", shape: "puck", price: 7800, colours: ["black", "blue", "pink", "grey"],
    short: "Pocket speaker with strap, up to 16 hours, IP67",
    description: "A pocket-size speaker with a strap you can hang anywhere. Up to 16 hours of battery and IP67 protection.",
    highlights: ["Up to 16 hours", "IP67", "Strap included", "Hands-free calls"],
    specs: [["Brand", "Sony"], ["Speaker maximum output power", "5 W"], ["Battery life", "16 hours"], ["Water resistance", "IP67 waterproof"], ["Connectivity", "Bluetooth 5.3, USB-C"], ["Audio output mode", "Mono"], ["Weight", "0.27 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: null, stock: 11
  }),
  speaker({
    name: "Marshall Acton III Bluetooth home speaker",
    brand: "Marshall", shape: "box", price: 38500, colours: ["black", "brown", "white"],
    short: "Room-filling stereo sound with bass and treble knobs, Bluetooth and 3.5 mm input",
    description: "The classic amp look for your shelf. Stereo sound, bass and treble knobs, Bluetooth 5.2 and a 3.5 mm input. Plugs into the wall.",
    highlights: ["60 W stereo", "Bass and treble knobs", "Bluetooth and 3.5 mm input", "Mains powered"],
    specs: [["Brand", "Marshall"], ["Speaker maximum output power", "60 W"], ["Connectivity", "Bluetooth 5.2, Auxiliary 3.5 mm"], ["Audio output mode", "Stereo"], ["Power source", "Mains (plug-in)"], ["Weight", "2.85 kg"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: { l: "265 mm", h: "185 mm", d: "165 mm deep", weight: "2.85 KG" }, stock: 4
  }),
  speaker({
    name: "Samsung 2.1 soundbar 300 W with wireless subwoofer",
    brand: "Samsung", shape: "soundbar", price: 31500, colours: ["black"],
    short: "300 W, wireless subwoofer, HDMI ARC, optical and Bluetooth",
    description: "Big cinema sound for your TV. A 2.1 soundbar with a wireless subwoofer, HDMI ARC, optical input and Bluetooth.",
    highlights: ["300 W", "Wireless subwoofer", "HDMI ARC", "Bluetooth"],
    specs: [["Brand", "Samsung"], ["Speaker maximum output power", "300 W"], ["Channels", "2.1"], ["Connectivity", "Bluetooth, HDMI, Optical, USB"], ["Audio output mode", "Surround"], ["Subwoofer", "Wireless, 6.5 inch"], ["Power source", "Mains (plug-in)"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: null, stock: 4, section: "Soundbars"
  }),
  speaker({
    name: "Vitron 2.1 home theatre with subwoofer, Bluetooth, FM, USB",
    brand: "Vitron", shape: "soundbar", price: 7800, colours: ["black"],
    short: "Affordable 2.1 system for the sitting room, Bluetooth, FM radio, USB and remote",
    description: "An affordable sound system for the sitting room: subwoofer and two satellites, Bluetooth, FM radio, USB playback and a remote control.",
    highlights: ["60 W total", "FM radio", "USB and SD playback", "Remote control"],
    specs: [["Brand", "Vitron"], ["Speaker maximum output power", "60 W"], ["Channels", "2.1"], ["Connectivity", "Bluetooth, USB, Auxiliary, FM radio"], ["Audio output mode", "Stereo"], ["Power source", "Mains (plug-in)"], ["Warranty", "6 months"], ["Condition", "New"]],
    size: null, stock: 8, section: "Home theatre"
  }),
  speaker({
    name: "Oraimo SoundPro portable speaker 20 W",
    brand: "Oraimo", shape: "cylinder", price: 3400, colours: ["black", "blue"],
    short: "20 W, 24 hours playtime, IPX5, RGB lights",
    description: "Loud for its size: 20 W, RGB lights, IPX5 splash protection and up to 24 hours of playtime.",
    highlights: ["20 W", "Up to 24 hours", "IPX5", "RGB lights"],
    specs: [["Brand", "Oraimo"], ["Speaker maximum output power", "20 W"], ["Battery life", "24 hours"], ["Water resistance", "IPX5 water resistant"], ["Connectivity", "Bluetooth 5.3, USB, Auxiliary"], ["Audio output mode", "Stereo"], ["Warranty", "1 year"], ["Condition", "New"]],
    size: null, stock: 12
  }),
  speaker({
    name: "Hisense 55 inch 4K UHD smart TV (VIDAA)",
    brand: "Hisense", shape: "tv", price: 58500, colours: ["black"],
    extraAxis: { key: "size", label: "Screen size", display: "button", values: [{ id: "43", label: "43 inch" }, { id: "50", label: "50 inch" }, { id: "55", label: "55 inch" }, { id: "65", label: "65 inch" }] },
    priceOf: (c) => ({ 43: 38500, 50: 47500, 55: 58500, 65: 84500 })[c.size],
    short: "4K UHD, HDR, Dolby Vision, Netflix and YouTube built in",
    description: "Sharp 4K picture with HDR and Dolby Vision, VIDAA smart apps including Netflix and YouTube, three HDMI ports.",
    highlights: ["4K UHD", "Dolby Vision", "VIDAA smart apps", "3 HDMI"],
    specs: [["Brand", "Hisense"], ["Screen size", "55 inch"], ["Resolution", "4K UHD"], ["Smart TV", "VIDAA"], ["Connectivity", "Wi-Fi, Bluetooth, HDMI, USB, Optical"], ["Warranty", "2 years"], ["Condition", "New"]],
    size: null, stock: 4, section: "TVs"
  })
];

// The same few speakers again at a second shop, at its own prices, so search results come from more than one seller.
export const AUDIO_PRODUCTS_SECOND_SHOP = [AUDIO_PRODUCTS[0], AUDIO_PRODUCTS[4], AUDIO_PRODUCTS[8]].map((p) => ({
  ...p,
  videos: [],
  priceKes: Math.round((p.priceKes * 1.04) / 50) * 50,
  optionVariants: p.optionVariants.map((v) => ({ ...v, price: Math.round((v.price * 1.04) / 50) * 50 }))
}));
