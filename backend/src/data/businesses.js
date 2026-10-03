import { slugify } from "@epicmkt/shared";
import { attributesById } from "./attributes.js";
import { offersById } from "./offers.js";
import { coverArt, logoArt, serviceArt, galleryArt } from "./art.js";

const week = (weekday, sat = weekday, sun = null) => ({
  mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun
});

const gallery = (hue, labels) =>
  labels.map((caption, i) => {
    const h = (hue + i * 28) % 360;
    return { id: `g${i + 1}`, hue: h, caption, url: galleryArt(h, caption) };
  });

const shortcodeOf = (i) => Math.imul(i, 2654435761).toString(36).replace("-", "").slice(0, 6).padStart(6, "0");

const seedStats = (i) => ({
  view: 140 + ((i * 97) % 520),
  call: 12 + ((i * 31) % 90),
  whatsapp: 18 + ((i * 43) % 110),
  directions: 9 + ((i * 23) % 70)
});

const make = (i, b) => {
  const id = `b_${String(i).padStart(3, "0")}`;
  const hue = b.hue ?? 210;
  return {
    id,
    slug: slugify(b.name),
    shortcode: shortcodeOf(i),
    sellerId: `s_${String(i).padStart(3, "0")}`,
    status: "active",
    plan: "standard",
    verified: false,
    email: null,
    socials: {},
    attributes: attributesById[id] ?? {},
    offers: offersById[id] ?? [],
    stats: seedStats(i),
    createdAt: new Date(Date.UTC(2025, i % 12, 1 + (i % 27))).toISOString(),
    planExpiresAt: new Date(Date.UTC(2026, 9 + (i % 3), 1 + (i % 27))).toISOString(),
    coverUrl: coverArt(hue, b.name),
    logoUrl: logoArt(hue, b.name),
    ...b,
    townSlug: slugify(b.area),
    services: (b.services ?? []).map((svc, n) => ({
      ...svc,
      id: svc.id ?? slugify(svc.name),
      imageUrl: svc.imageUrl ?? serviceArt((hue + n * 24) % 360, svc.name)
    }))
  };
};

export const businesses = [
  make(1, {
    name: "Fade Kings Barbershop", categoryId: "barbershops", plan: "premium", verified: true,
    tagline: "Clean fades and sharp lines, Maseno's favourite chair",
    description: "Four chairs, trained barbers and a quiet waiting area. Walk-ins welcome, with kids' cuts and beard shaping all day.",
    phone: "0712555101", whatsapp: "0712555101", email: "hello@fadekings.example",
    county: "Kisumu", area: "Maseno", address: "Maseno Town, opposite the main stage", lat: -0.0061, lng: 34.6012,
    hours: week(["08:00", "20:00"], ["07:30", "21:00"], ["10:00", "18:00"]),
    rating: 4.8, reviewCount: 126, hue: 210,
    tags: ["haircut", "fade", "beard trim", "kids cut", "shave"],
    socials: { instagram: "fadekingsmaseno", facebook: "fadekingsmaseno", tiktok: "fadekings.ke" },
    services: [
      { name: "Haircut", priceKes: 150, section: "Cuts", description: "Clean cut with clippers and scissors, finished with a neck shave.", availability: "available" },
      { name: "Fade and beard", priceKes: 300, section: "Cuts", description: "Skin or taper fade with full beard shaping and line-up.", specs: [{ label: "Duration", value: "45 minutes" }, { label: "Includes", value: "Hot towel" }] },
      { name: "Kids cut", priceKes: 100, section: "Cuts", description: "Patient barbers for children under 12.", availability: "limited" }
    ],
    gallery: gallery(210, ["Shop front", "Fade work", "Beard trim", "Waiting area", "Kids corner", "Tools"])
  }),
  make(2, {
    name: "Sharp Cutz Gents Salon", categoryId: "barbershops",
    tagline: "Quick, tidy cuts in the middle of town",
    description: "Reliable gents' barbershop near Kisumu bus park. Open early for commuters.",
    phone: "0723555102", whatsapp: "0723555102",
    county: "Kisumu", area: "Kisumu CBD", address: "Oginga Odinga Street, near the bus park", lat: -0.0917, lng: 34.768,
    hours: week(["07:00", "20:00"], ["07:00", "21:00"], ["09:00", "17:00"]),
    rating: 4.3, reviewCount: 58, hue: 215,
    tags: ["haircut", "shave", "dreadlocks"],
    services: [{ name: "Haircut", priceKes: 120 }, { name: "Shave", priceKes: 80 }],
    gallery: gallery(215, ["Shop front", "Chairs"])
  }),
  make(3, {
    name: "Smooth Edge Barbers", categoryId: "barbershops",
    tagline: "Precision cuts in Ngara",
    description: "Modern barbershop with hot towel shaves and student discounts on weekdays.",
    phone: "0734555103", whatsapp: "0734555103",
    county: "Nairobi", area: "Ngara", address: "Ngara Road, next to the pharmacy", lat: -1.2754, lng: 36.8209,
    hours: week(["08:00", "21:00"], ["08:00", "22:00"], ["11:00", "19:00"]),
    rating: 4.5, reviewCount: 94, hue: 205,
    tags: ["haircut", "fade", "hot towel shave", "student discount"],
    services: [{ name: "Haircut", priceKes: 200 }, { name: "Hot towel shave", priceKes: 250 }],
    gallery: gallery(205, ["Entrance", "Cutting floor"])
  }),
  make(4, {
    name: "Pure Drop Water Refill", categoryId: "water-refill",
    tagline: "Treated drinking water, refilled while you wait",
    description: "Filtered and UV-treated water. Bring your own container or buy one here.",
    phone: "0745555104", whatsapp: "0745555104",
    county: "Kisumu", area: "Maseno", address: "Maseno University Road, behind Total", lat: -0.0049, lng: 34.5998,
    hours: week(["06:30", "20:00"], ["06:30", "20:00"], ["07:00", "18:00"]),
    rating: 4.6, reviewCount: 41, hue: 195,
    tags: ["drinking water", "20 litre refill", "jerrycan", "treated water"],
    services: [{ name: "20L refill", priceKes: 30 }, { name: "10L refill", priceKes: 20 }],
    gallery: gallery(195, ["Refill station", "Storage tanks"])
  }),
  make(5, {
    name: "Aqua Fresh Refill Station", categoryId: "water-refill", plan: "premium", verified: true,
    tagline: "Purified water with free delivery within Milimani",
    description: "Reverse-osmosis purified water, tested weekly. Dispensers for 5, 10 and 20 litre containers.",
    phone: "0756555105", whatsapp: "0756555105", email: "aquafresh@example.com",
    county: "Kisumu", area: "Milimani", address: "Milimani Road, near Lake Basin Mall", lat: -0.1021, lng: 34.7523,
    hours: week(["06:00", "21:00"], ["06:00", "21:00"], ["07:00", "19:00"]),
    rating: 4.7, reviewCount: 73, hue: 190,
    tags: ["purified water", "refill", "delivery", "dispenser"],
    socials: { facebook: "aquafreshkisumu", instagram: "aquafresh.ksm" },
    services: [{ name: "20L refill", priceKes: 40 }, { name: "5L refill", priceKes: 15 }],
    gallery: gallery(190, ["Station", "Purification unit", "Containers", "Delivery bike"])
  }),
  make(6, {
    name: "BlueSpring Water Point", categoryId: "water-refill",
    tagline: "Affordable clean water in Kasarani",
    description: "Neighbourhood refill point serving homes and small businesses.",
    phone: "0767555106", whatsapp: "0767555106",
    county: "Nairobi", area: "Kasarani", address: "Kasarani Mwiki Road, Stage 3", lat: -1.2218, lng: 36.8994,
    hours: week(["06:00", "20:00"], ["06:00", "20:00"], ["06:00", "16:00"]),
    rating: 4.1, reviewCount: 28, hue: 198,
    tags: ["drinking water", "refill", "jerrycan"],
    services: [{ name: "20L refill", priceKes: 25 }],
    gallery: gallery(198, ["Water point"])
  }),
  make(7, {
    name: "Afya Plus Chemist", categoryId: "chemists", plan: "premium", verified: true,
    tagline: "Licensed pharmacists, open late in Kondele",
    description: "Prescription and over-the-counter medicines, first aid supplies, baby care and blood pressure checks.",
    phone: "0778555107", whatsapp: "0778555107", email: "afyaplus@example.com",
    county: "Kisumu", area: "Kondele", address: "Kondele Junction, ground floor Sunrise Plaza", lat: -0.0845, lng: 34.7912,
    hours: week(["07:30", "22:00"], ["07:30", "22:00"], ["09:00", "20:00"]),
    rating: 4.9, reviewCount: 187, hue: 150,
    tags: ["pharmacy", "medicine", "prescription", "first aid", "blood pressure"],
    socials: { facebook: "afyapluschemist", x: "afyapluske" },
    services: [{ name: "Blood pressure check", priceKes: 50 }, { name: "Sugar test", priceKes: 100 }],
    gallery: gallery(150, ["Counter", "Shelves", "Consultation corner", "Entrance"])
  }),
  make(8, {
    name: "Maseno Community Pharmacy", categoryId: "chemists",
    tagline: "Trusted neighbourhood pharmacy",
    description: "Medicines, supplements and family planning products with friendly advice from a qualified pharmacist.",
    phone: "0789555108", whatsapp: "0789555108",
    county: "Kisumu", area: "Maseno", address: "Maseno Town, next to the post office", lat: -0.0072, lng: 34.6037,
    hours: week(["08:00", "20:30"], ["08:00", "20:30"], ["10:00", "17:00"]),
    rating: 4.4, reviewCount: 66, hue: 155,
    tags: ["pharmacy", "medicine", "supplements"],
    gallery: gallery(155, ["Storefront", "Counter"])
  }),
  make(9, {
    name: "Nakuru Wellness Chemist", categoryId: "chemists",
    tagline: "Everyday health needs in Section 58",
    description: "Pharmacy with a small clinic room for minor checks.",
    phone: "0790555109", whatsapp: "0790555109",
    county: "Nakuru", area: "Section 58", address: "Section 58 Shopping Centre", lat: -0.2837, lng: 36.0655,
    hours: week(["08:00", "21:00"], ["08:00", "21:00"], ["09:00", "18:00"]),
    rating: 4.2, reviewCount: 39, hue: 160,
    tags: ["pharmacy", "medicine", "clinic"],
    gallery: gallery(160, ["Shopfront"])
  }),
  make(10, {
    name: "GreenField Agrovet", categoryId: "agrovets", plan: "premium", verified: true,
    tagline: "Certified seeds, fertiliser and animal feeds in Kakamega",
    description: "Farm inputs and advice for maize, beans and dairy farmers. Vet products and dairy meal stocked daily.",
    phone: "0701555110", whatsapp: "0701555110", email: "greenfield@example.com",
    county: "Kakamega", area: "Kakamega Town", address: "Mumias Road, opposite the market", lat: 0.2827, lng: 34.7519,
    hours: week(["07:30", "18:30"], ["07:30", "18:00"], ["08:30", "13:00"]),
    rating: 4.7, reviewCount: 102, hue: 110,
    tags: ["seeds", "fertiliser", "animal feeds", "veterinary", "dairy meal", "farm tools"],
    socials: { facebook: "greenfieldagrovet", tiktok: "greenfield.agrovet" },
    services: [
      { name: "Certified maize seed 2kg", priceKes: 650, section: "Seed", description: "Certified hybrid maize seed for the long rains.", specs: [{ label: "Pack size", value: "2 kg" }, { label: "Maturity", value: "120 to 140 days" }, { label: "Germination", value: "90% minimum" }] },
      { name: "Dairy meal 70kg", priceKes: 2900, section: "Feeds", description: "Balanced dairy ration for milking cows.", specs: [{ label: "Pack size", value: "70 kg" }, { label: "Protein", value: "16%" }] }
    ],
    gallery: gallery(110, ["Seed shelves", "Feed store", "Vet counter", "Farm tools"])
  }),
  make(11, {
    name: "Shamba Care Agrovet", categoryId: "agrovets",
    tagline: "Farm inputs for Langas and beyond",
    description: "Fertiliser, pesticides, poultry feeds and drip-kit supplies.",
    phone: "0712555111", whatsapp: "0712555111",
    county: "Uasin Gishu", area: "Langas", address: "Langas Market, Eldoret", lat: 0.5143, lng: 35.2698,
    hours: week(["07:30", "18:30"], ["07:30", "18:00"], null),
    rating: 4.3, reviewCount: 47, hue: 115,
    tags: ["fertiliser", "pesticides", "poultry feed", "drip kit"],
    gallery: gallery(115, ["Counter", "Stockroom"])
  }),
  make(12, {
    name: "Lakeside Agrovet and Seeds", categoryId: "agrovets",
    tagline: "Rice, vegetable and fish farming supplies",
    description: "Seeds, fish feed, pond liners and vet products for lakeside farmers.",
    phone: "0723555112", whatsapp: "0723555112",
    county: "Kisumu", area: "Ahero", address: "Ahero Town, near the rice mill", lat: -0.1744, lng: 34.9189,
    hours: week(["07:30", "18:00"], ["07:30", "17:00"], null),
    rating: 4.4, reviewCount: 35, hue: 120,
    tags: ["seeds", "fish feed", "rice", "veterinary"],
    gallery: gallery(120, ["Shop", "Seeds"])
  }),
  make(13, {
    name: "IronCore Gym", categoryId: "gyms", plan: "premium", verified: true,
    tagline: "Strength-focused small gym in Kilimani",
    description: "Free weights, racks, cardio machines and group classes. Day pass and monthly membership available.",
    phone: "0734555113", whatsapp: "0734555113", email: "join@ironcore.example",
    county: "Nairobi", area: "Kilimani", address: "Argwings Kodhek Road, 2nd floor", lat: -1.2921, lng: 36.7881,
    hours: week(["05:30", "22:00"], ["07:00", "20:00"], ["08:00", "16:00"]),
    rating: 4.8, reviewCount: 211, hue: 20,
    tags: ["weights", "personal trainer", "cardio", "classes", "day pass"],
    socials: { instagram: "ironcorenairobi", tiktok: "ironcore.ke", x: "ironcoreke" },
    services: [{ name: "Day pass", priceKes: 400 }, { name: "Monthly membership", priceKes: 4500 }],
    gallery: gallery(20, ["Weights floor", "Cardio zone", "Class studio", "Reception", "Racks"])
  }),
  make(14, {
    name: "FitHub Maseno", categoryId: "gyms",
    tagline: "Affordable gym for students and locals",
    description: "Compact gym with machines, dumbbells and a stretching area.",
    phone: "0745555114", whatsapp: "0745555114",
    county: "Kisumu", area: "Maseno", address: "Maseno, above Equity branch", lat: -0.0043, lng: 34.6009,
    hours: week(["06:00", "21:00"], ["07:00", "19:00"], ["08:00", "14:00"]),
    rating: 4.2, reviewCount: 52, hue: 25,
    tags: ["weights", "machines", "student rate", "day pass"],
    services: [{ name: "Day pass", priceKes: 200 }, { name: "Monthly membership", priceKes: 2000 }],
    gallery: gallery(25, ["Gym floor", "Entrance"])
  }),
  make(15, {
    name: "Coast Flex Fitness", categoryId: "gyms",
    tagline: "Train near the beach in Nyali",
    description: "Open-plan gym with cardio, free weights and morning boot camps.",
    phone: "0756555115", whatsapp: "0756555115",
    county: "Mombasa", area: "Nyali", address: "Links Road, Nyali", lat: -4.0267, lng: 39.7123,
    hours: week(["05:30", "21:00"], ["06:30", "19:00"], ["07:30", "13:00"]),
    rating: 4.5, reviewCount: 88, hue: 30,
    tags: ["weights", "cardio", "boot camp"],
    services: [{ name: "Day pass", priceKes: 500 }],
    gallery: gallery(30, ["Main floor", "Outdoor area"])
  }),
  make(16, {
    name: "Glow Beauty Parlour", categoryId: "salons",
    tagline: "Hair, nails and makeup in Milimani",
    description: "Full-service ladies' salon offering relaxers, treatments, manicures and bridal makeup.",
    phone: "0767555116", whatsapp: "0767555116",
    county: "Kisumu", area: "Milimani", address: "Milimani Estate, behind the petrol station", lat: -0.0987, lng: 34.7561,
    hours: week(["08:00", "19:30"], ["07:30", "20:00"], ["10:00", "16:00"]),
    rating: 4.6, reviewCount: 79, hue: 320,
    tags: ["hair", "nails", "makeup", "manicure", "relaxer"],
    services: [{ name: "Wash and blow-dry", priceKes: 500 }, { name: "Manicure", priceKes: 600 }],
    gallery: gallery(320, ["Styling area", "Nail station"])
  }),
  make(17, {
    name: "Crown Braids and Weaves", categoryId: "salons", plan: "premium", verified: true,
    tagline: "Braids, weaves and natural hair care in Kasarani",
    description: "Specialists in box braids, cornrows, wigs and natural hair treatments. Book by WhatsApp for faster service.",
    phone: "0778555117", whatsapp: "0778555117",
    county: "Nairobi", area: "Kasarani", address: "Thika Road Mall area, Kasarani", lat: -1.2195, lng: 36.8888,
    hours: week(["08:00", "20:00"], ["07:30", "21:00"], ["09:00", "18:00"]),
    rating: 4.8, reviewCount: 143, hue: 330,
    tags: ["braids", "weaves", "wigs", "natural hair", "cornrows"],
    socials: { instagram: "crownbraidske", tiktok: "crownbraids", facebook: "crownbraidske" },
    services: [
      {
        name: "Box braids", priceKes: 2500, section: "Braids",
        description: "Neat box braids in your chosen length. Hair not included.",
        variants: [{ id: "small", label: "Small", price: 3500 }, { id: "medium", label: "Medium", price: 2500 }, { id: "jumbo", label: "Jumbo", price: 1800 }],
        specs: [{ group: "Service", label: "Duration", value: "4 to 6 hours" }, { group: "Service", label: "Lasts", value: "4 to 6 weeks" }, { group: "Booking", label: "Deposit", value: "KSh 500" }]
      },
      { name: "Cornrows", priceKes: 800, section: "Braids", description: "Straight-back or styled cornrows." },
      { name: "Wig install", priceKes: 1200, section: "Wigs", description: "Wig fitting, styling and install.", availability: "limited" }
    ],
    gallery: gallery(330, ["Braiding area", "Wig display", "Results", "Reception"])
  }),
  make(18, {
    name: "Rift Auto Garage", categoryId: "mechanics",
    tagline: "Honest repairs and servicing in Nakuru",
    description: "General servicing, brakes, suspension and diagnostics for most petrol and diesel vehicles.",
    phone: "0789555118", whatsapp: "0789555118",
    county: "Nakuru", area: "Industrial Area", address: "Kenyatta Avenue Industrial Area, Nakuru", lat: -0.2975, lng: 36.0746,
    hours: week(["07:30", "18:00"], ["07:30", "16:00"], null),
    rating: 4.4, reviewCount: 61, hue: 240,
    tags: ["car service", "brakes", "diagnostics", "suspension"],
    services: [{ name: "Basic service", priceKes: 3500 }, { name: "Diagnostics", priceKes: 1500 }],
    gallery: gallery(240, ["Workshop", "Service bay"])
  }),
  make(19, {
    name: "Jua Kali Motors", categoryId: "mechanics",
    tagline: "Quick fixes for matatus and pickups",
    description: "Engine repair, welding and panel work at fair prices.",
    phone: "0790555119", whatsapp: "0790555119",
    county: "Uasin Gishu", area: "Eldoret Town", address: "Uganda Road, Eldoret", lat: 0.5204, lng: 35.2737,
    hours: week(["07:00", "18:30"], ["07:00", "17:00"], null),
    rating: 4.1, reviewCount: 33, hue: 245,
    tags: ["engine repair", "welding", "panel beating"],
    gallery: gallery(245, ["Workshop"])
  }),
  make(20, {
    name: "Mwanzo Hardware", categoryId: "hardware",
    tagline: "Cement, iron sheets and plumbing supplies",
    description: "Building materials, paints, electrical fittings and tools with delivery nearby.",
    phone: "0701555120", whatsapp: "0701555120",
    county: "Kisumu", area: "Kibuye", address: "Kibuye Market Road", lat: -0.1131, lng: 34.7584,
    hours: week(["07:30", "18:30"], ["07:30", "18:00"], ["09:00", "13:00"]),
    rating: 4.3, reviewCount: 44, hue: 35,
    tags: ["cement", "iron sheets", "paint", "plumbing", "electrical"],
    gallery: gallery(35, ["Yard", "Counter"])
  }),
  make(21, {
    name: "Mama Pima Kitchen", categoryId: "eateries",
    tagline: "Home-style meals near the university",
    description: "Ugali, fish, sukuma, chapati and tea at student-friendly prices.",
    phone: "0712555121", whatsapp: "0712555121",
    county: "Kisumu", area: "Maseno", address: "Maseno University gate road", lat: -0.0035, lng: 34.6021,
    hours: week(["06:30", "21:00"], ["06:30", "21:00"], ["08:00", "20:00"]),
    rating: 4.7, reviewCount: 158, hue: 5,
    tags: ["lunch", "ugali", "fish", "chapati", "breakfast"],
    services: [{ name: "Ugali and fish", priceKes: 350 }, { name: "Chapati and beans", priceKes: 120 }],
    gallery: gallery(5, ["Dining area", "Daily specials"])
  }),
  make(22, {
    name: "Swahili Plate Mombasa", categoryId: "eateries", plan: "premium", verified: true,
    tagline: "Coastal Swahili dishes in Old Town",
    description: "Biryani, pilau, samaki wa kupaka and fresh juices served in a relaxed courtyard.",
    phone: "0723555122", whatsapp: "0723555122", email: "eat@swahiliplate.example",
    county: "Mombasa", area: "Old Town", address: "Nkrumah Road, Old Town", lat: -4.0626, lng: 39.6769,
    hours: week(["10:00", "22:00"], ["10:00", "23:00"], ["11:00", "22:00"]),
    rating: 4.9, reviewCount: 264, hue: 15,
    tags: ["biryani", "pilau", "seafood", "juice", "swahili food"],
    socials: { instagram: "swahiliplate", facebook: "swahiliplatemombasa", x: "swahiliplate" },
    services: [{ name: "Chicken biryani", priceKes: 600 }, { name: "Samaki wa kupaka", priceKes: 750 }],
    gallery: gallery(15, ["Courtyard", "Biryani", "Seafood platter", "Juice bar", "Dining room"])
  }),
  make(23, {
    name: "QuickFix Phones", categoryId: "phone-repair", status: "pending",
    tagline: "Screens and batteries while you wait",
    description: "Phone repair kiosk offering screen replacement, battery swaps and software fixes.",
    phone: "0734555123", whatsapp: "0734555123",
    county: "Kisumu", area: "Kisumu CBD", address: "Jomo Kenyatta Highway, Mega Plaza", lat: -0.0931, lng: 34.7692,
    hours: week(["08:00", "19:00"], ["08:00", "19:00"], ["10:00", "16:00"]),
    rating: 0, reviewCount: 0, hue: 270,
    tags: ["screen repair", "battery", "software"],
    gallery: gallery(270, ["Kiosk"])
  }),
  make(24, {
    name: "Old Lake Chemist", categoryId: "chemists", status: "suspended",
    tagline: "Pharmacy by the lakeshore",
    description: "Listing suspended for an overdue plan payment.",
    phone: "0745555124", whatsapp: "0745555124",
    county: "Kisumu", area: "Dunga", address: "Dunga Beach Road", lat: -0.1304, lng: 34.7413,
    hours: week(["08:00", "19:00"], ["08:00", "19:00"], null),
    rating: 3.9, reviewCount: 12, hue: 165,
    tags: ["pharmacy", "medicine"],
    gallery: gallery(165, ["Shopfront"])
  }),
  make(25, {
    name: "Sparkle Car Wash", categoryId: "car-wash", verified: true,
    tagline: "Cars, SUVs and matatus washed spotless",
    description: "Three covered bays with a waiting area. We also come to your home or office for a mobile wash.",
    phone: "0712555125", whatsapp: "0712555125",
    county: "Kisumu", area: "Maseno", address: "Maseno Town, along the Kisumu-Busia road", lat: -0.0072, lng: 34.6021,
    hours: week(["07:00", "19:00"], ["07:00", "19:00"], ["08:00", "17:00"]),
    rating: 4.4, reviewCount: 37, hue: 200,
    tags: ["car wash", "interior cleaning", "engine wash", "mobile wash"],
    services: [{ name: "Exterior wash", priceKes: 200 }, { name: "Full wash", priceKes: 500 }, { name: "Engine wash", priceKes: 400 }],
    gallery: gallery(200, ["Wash bays", "Waiting area", "Finished car"])
  }),
  make(26, {
    name: "Southend Auto Spa", categoryId: "car-wash",
    tagline: "Detailing and polish for cars and trucks",
    description: "Full valeting with underbody wash, polishing and seat cleaning. Book ahead for same-day detailing.",
    phone: "0723555126", whatsapp: "0723555126",
    county: "Nairobi", area: "South B", address: "Mombasa Road, near the South B shopping centre", lat: -1.3098, lng: 36.8333,
    hours: week(["07:30", "19:00"], ["07:30", "19:30"], ["08:00", "17:00"]),
    rating: 4.1, reviewCount: 22, hue: 205,
    tags: ["car wash", "detailing", "polish", "underbody wash"],
    services: [{ name: "Exterior wash", priceKes: 300 }, { name: "Full valet", priceKes: 1200 }, { name: "Seat cleaning", priceKes: 1500 }],
    gallery: gallery(205, ["Detailing bay", "Polished finish"])
  }),
  make(27, {
    name: "Stitch and Style Tailors", categoryId: "tailors", plan: "premium", verified: true,
    tagline: "Suits, kitenge and uniforms made to measure",
    description: "Experienced tailors for suits, dresses, African print and school uniforms. Alterations done while you wait.",
    phone: "0734555127", whatsapp: "0734555127",
    county: "Kisumu", area: "Kisumu CBD", address: "Ogada Street, above the stationery shop", lat: -0.0998, lng: 34.7534,
    hours: week(["08:00", "18:30"], ["08:00", "18:00"], null),
    rating: 4.7, reviewCount: 64, hue: 290,
    tags: ["tailor", "suits", "kitenge", "alterations", "uniforms"],
    socials: { instagram: "stitchandstylekisumu", facebook: "stitchandstylekisumu" },
    services: [{ name: "Trouser alteration", priceKes: 150 }, { name: "Kitenge dress", priceKes: 1800 }, { name: "Two-piece suit", priceKes: 6500 }],
    gallery: gallery(290, ["Workshop", "Suits", "Kitenge designs", "Fitting room"])
  }),
  make(28, {
    name: "Zawadi Mitumba Boutique", categoryId: "tailors",
    tagline: "Clean, hand-picked mitumba for ladies and kids",
    description: "Sorted second-hand dresses, tops, jeans and kids' wear. New stock arrives every Tuesday and Friday.",
    phone: "0745555128", whatsapp: "0745555128",
    county: "Nakuru", area: "Nakuru Town", address: "Kenyatta Avenue, next to the market gate", lat: -0.2833, lng: 36.0667,
    hours: week(["08:00", "19:00"], ["08:00", "19:00"], ["10:00", "16:00"]),
    rating: 4.0, reviewCount: 18, hue: 295,
    tags: ["mitumba", "boutique", "dresses", "kids wear"],
    services: [{ name: "Dresses from", priceKes: 400 }, { name: "Jeans from", priceKes: 350 }, { name: "Kids outfits from", priceKes: 250 }],
    gallery: gallery(295, ["Shop floor", "New arrivals"])
  }),
  make(29, {
    name: "Maseno Mobile Money Point", categoryId: "mpesa", verified: true,
    tagline: "M-PESA and Airtel Money, with printing on the side",
    description: "Deposits, withdrawals, airtime and bill payments with a large float. Printing and photocopying available.",
    phone: "0712555129", whatsapp: "0712555129",
    county: "Kisumu", area: "Maseno", address: "Maseno Town, beside the supermarket", lat: -0.0055, lng: 34.6008,
    hours: week(["06:30", "21:00"], ["06:30", "21:00"], ["08:00", "19:00"]),
    rating: 4.5, reviewCount: 52, hue: 140,
    tags: ["mpesa", "airtel money", "airtime", "bill payment", "printing"],
    services: [{ name: "Black and white printing per page", priceKes: 10 }, { name: "Photocopy per page", priceKes: 5 }],
    gallery: gallery(140, ["Counter", "Shopfront"])
  }),
  make(30, {
    name: "Westlands Cash Hub", categoryId: "mpesa",
    tagline: "Open 24 hours, bank agency and eCitizen help",
    description: "Round-the-clock mobile money and bank agency for Equity, KCB and Co-operative Bank, plus passport photos and eCitizen help.",
    phone: "0723555130", whatsapp: "0723555130",
    county: "Nairobi", area: "Westlands", address: "Mpaka Road, opposite the petrol station", lat: -1.2673, lng: 36.8112,
    hours: week(["00:00", "23:59"], ["00:00", "23:59"], ["00:00", "23:59"]),
    rating: 4.2, reviewCount: 31, hue: 145,
    tags: ["mpesa", "bank agent", "24 hours", "ecitizen", "passport photos"],
    services: [{ name: "Passport photos", priceKes: 300 }, { name: "eCitizen assistance", priceKes: 200 }],
    gallery: gallery(145, ["Counter", "Night view"])
  }),
  make(31, {
    name: "Mboga Fresh Maseno", categoryId: "groceries",
    tagline: "Farm-fresh fruit and vegetables every morning",
    description: "Tomatoes, sukuma wiki, onions, bananas and eggs bought direct from local farmers. Order by WhatsApp for same-day delivery.",
    phone: "0734555131", whatsapp: "0734555131",
    county: "Kisumu", area: "Maseno", address: "Maseno Market, stall 12", lat: -0.0043, lng: 34.5987,
    hours: week(["06:00", "19:30"], ["06:00", "19:30"], ["07:00", "14:00"]),
    rating: 4.6, reviewCount: 44, hue: 100,
    tags: ["mboga", "vegetables", "fruit", "eggs", "market"],
    services: [{ name: "Tomatoes per kg", priceKes: 80 }, { name: "Sukuma wiki bunch", priceKes: 20 }, { name: "Eggs tray", priceKes: 420 }],
    gallery: gallery(100, ["Fresh stall", "Fruit display"])
  }),
  make(32, {
    name: "Jirani Mini Supermarket", categoryId: "groceries", verified: true,
    tagline: "Your neighbourhood duka for everyday shopping",
    description: "Flour, milk, bread, vegetables and household goods under one roof, with delivery within Nakuru town.",
    phone: "0745555132", whatsapp: "0745555132",
    county: "Nakuru", area: "Section 58", address: "Section 58 Estate, main road", lat: -0.2987, lng: 36.0543,
    hours: week(["07:00", "21:00"], ["07:00", "21:00"], ["08:00", "20:00"]),
    rating: 4.3, reviewCount: 70, hue: 105,
    tags: ["supermarket", "groceries", "duka", "household"],
    services: [{ name: "Maize flour 2kg", priceKes: 190 }, { name: "Fresh milk 500ml", priceKes: 65 }],
    gallery: gallery(105, ["Aisles", "Fresh produce", "Checkout"])
  }),
  make(33, {
    name: "Kisumu Prime Butchery", categoryId: "butchery", plan: "premium", verified: true,
    tagline: "Fresh beef and goat, cut to order, nyama choma on site",
    description: "Daily fresh meat from licensed slaughterhouses. Order for events, or sit down for roasted goat and beef.",
    phone: "0712555133", whatsapp: "0712555133",
    county: "Kisumu", area: "Kisumu CBD", address: "Nyalenda Road, near the market", lat: -0.1064, lng: 34.7581,
    hours: week(["07:00", "21:00"], ["07:00", "22:00"], ["08:00", "21:00"]),
    rating: 4.8, reviewCount: 112, hue: 355,
    tags: ["butchery", "beef", "goat", "nyama choma", "matumbo"],
    socials: { facebook: "kisumuprimebutchery", instagram: "kisumuprimebutchery" },
    services: [{ name: "Beef with bone per kg", priceKes: 600 }, { name: "Goat meat per kg", priceKes: 750 }, { name: "Roast goat per half kg", priceKes: 450 }],
    gallery: gallery(355, ["Display counter", "Nyama choma", "Cold room", "Shopfront"])
  }),
  make(34, {
    name: "Nyama Corner Butchery", categoryId: "butchery",
    tagline: "Beef, pork, chicken and sausages",
    description: "Neighbourhood butchery with refrigerated display and mincing while you wait.",
    phone: "0723555134", whatsapp: "0723555134",
    county: "Nairobi", area: "Kasarani", address: "Thika Road, Kasarani shopping centre", lat: -1.2211, lng: 36.8987,
    hours: week(["07:00", "20:30"], ["07:00", "20:30"], ["08:00", "18:00"]),
    rating: 3.9, reviewCount: 15, hue: 0,
    tags: ["butchery", "beef", "pork", "chicken", "sausages"],
    services: [{ name: "Beef per kg", priceKes: 650 }, { name: "Pork per kg", priceKes: 600 }],
    gallery: gallery(0, ["Counter", "Fresh cuts"])
  }),
  make(35, {
    name: "Golden Crust Bakery", categoryId: "bakery", plan: "premium", verified: true,
    tagline: "Hot bread at dawn and cakes for every celebration",
    description: "Family bakery with fresh bread every morning, custom birthday and wedding cakes, and wholesale to shops and hotels.",
    phone: "0734555135", whatsapp: "0734555135",
    county: "Kisumu", area: "Milimani", address: "Milimani Road, opposite the pharmacy", lat: -0.0889, lng: 34.7597,
    hours: week(["06:00", "20:00"], ["06:00", "20:00"], ["07:00", "14:00"]),
    rating: 4.9, reviewCount: 138, hue: 30,
    tags: ["bakery", "bread", "birthday cakes", "wedding cakes", "mandazi"],
    socials: { instagram: "goldencrustkisumu", facebook: "goldencrustkisumu", tiktok: "goldencrust.ke" },
    services: [{ name: "Bread 400g", priceKes: 65 }, { name: "Mandazi per piece", priceKes: 10 }, { name: "1 kg vanilla cake", priceKes: 1800 }],
    gallery: gallery(30, ["Fresh bread", "Cake display", "Bakery floor", "Wedding cake"])
  }),
  make(36, {
    name: "Sweet Layers Cakes", categoryId: "bakery",
    tagline: "Vegan and gluten-free cakes in Nyali",
    description: "Small-batch custom cakes and cupcakes baked to order, with vegan and gluten-free options.",
    phone: "0745555136", whatsapp: "0745555136",
    county: "Mombasa", area: "Nyali", address: "Links Road, Nyali", lat: -4.0233, lng: 39.7167,
    hours: week(["08:00", "18:00"], ["08:00", "18:00"], null),
    rating: 4.5, reviewCount: 26, hue: 340,
    tags: ["cakes", "cupcakes", "vegan", "gluten free"],
    services: [{ name: "Dozen cupcakes", priceKes: 1500 }, { name: "1 kg chocolate cake", priceKes: 2200 }],
    gallery: gallery(340, ["Cupcakes", "Custom cake"])
  })
];
