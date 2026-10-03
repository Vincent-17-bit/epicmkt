import { slugify } from "@epicmkt/shared";

const item = (name, price, section, description, specs, extra = {}) => ({
  name,
  priceKes: price,
  section,
  description,
  specs: specs.map(([label, value, group]) => ({ label, value, ...(group ? { group } : {}) })),
  ...extra
});

const WALK = ["Booking", "Walk-in or appointment"];
const CLEAN = ["Hygiene", "Sterilised tools"];

const barber = [
  item("Haircut", 150, "Cuts", "Clean cut with clippers and scissors, finished with a neck shave.", [["Duration", "30 minutes"], ["Tools", "Clippers and scissors"], ["Finish", "Neck shave and dusting"], CLEAN, WALK]),
  item("Fade and beard", 300, "Cuts", "Skin or taper fade with full beard shaping and line-up.", [["Duration", "45 minutes"], ["Fade styles", "Skin, taper, low, high"], ["Beard", "Shaping and line-up"], ["Finish", "Hot towel"], CLEAN, WALK], { duration: "45 minutes" }),
  item("Kids cut", 100, "Cuts", "Patient barbers for children under 12.", [["Age", "Under 12"], ["Duration", "20 minutes"], ["Seat", "Booster provided"], ["Styles", "Standard, fade, crew cut"], ["Parent", "Stays in the shop"]], { availability: "limited" }),
  item("Line-up", 80, "Cuts", "Sharp edges on the hairline and temples.", [["Duration", "10 minutes"], ["Areas", "Hairline and temples"], ["Tool", "Edge trimmer"], ["Lasts", "1 to 2 weeks"], WALK]),
  item("Shave", 80, "Shaves", "Smooth shave with foam and a fresh blade.", [["Duration", "15 minutes"], ["Method", "Foam and razor"], ["Blade", "Fresh blade per client"], ["Aftercare", "Alcohol-free balm"], WALK]),
  item("Hot towel shave", 250, "Shaves", "Steam, lather and straight razor with a cool towel finish.", [["Duration", "35 minutes"], ["Steps", "Steam, lather, razor, cool towel"], ["Products", "Pre-shave oil and balm"], ["Blade", "Fresh blade per client"], ["Booking", "Appointment advised"]]),
  item("Beard trim", 100, "Shaves", "Trim and shape with beard oil to finish.", [["Duration", "15 minutes"], ["Tools", "Trimmer and scissors"], ["Shaping", "Natural or sharp"], ["Finish", "Beard oil"], WALK]),
  item("Hair dye", 200, "Treatments", "Black, brown or grey cover applied with gloves and cape.", [["Colours", "Black, brown, grey cover"], ["Duration", "40 minutes"], ["Patch test", "On request"], ["Includes", "Gloves and cape"], ["Booking", "Appointment advised"]]),
  item("Scalp massage", 150, "Treatments", "Relaxing massage with coconut or menthol oil.", [["Duration", "15 minutes"], ["Oils", "Coconut or menthol"], ["Suited to", "Dry or tight scalp"], ["Add-on", "With any cut"], WALK]),
  item("Dreadlock retwist", 500, "Locs", "Neat retwist with palm roll or interlock.", [["Duration", "1 to 2 hours"], ["Method", "Palm roll or interlock"], ["Hair length", "Any"], ["Lasts", "3 to 4 weeks"], ["Booking", "Appointment required"]])
];

const salon = [
  item("Wash and blow-dry", 500, "Hair", "Shampoo, conditioner and a smooth blow-dry.", [["Duration", "1 hour"], ["Includes", "Shampoo and conditioner"], ["Finish", "Blow-dry and style"], ["Hair types", "All"], ["Booking", "Appointment advised"]]),
  item("Manicure", 600, "Nails", "Shape, cuticle care and polish.", [["Duration", "45 minutes"], ["Includes", "Shaping and cuticle care"], ["Polish", "Choice of colours"], ["Lasts", "1 to 2 weeks"], ["Hygiene", "Tools sterilised"]]),
  item("Box braids", 2500, "Braids", "Neat box braids in your chosen length. Hair not included.", [["Duration", "4 to 6 hours"], ["Lasts", "4 to 6 weeks"], ["Hair", "Bring your own"], ["Deposit", "KSh 500"], ["Booking", "Appointment required"]]),
  item("Cornrows", 800, "Braids", "Straight-back or styled cornrows.", [["Duration", "1 to 2 hours"], ["Styles", "Straight-back, patterned"], ["Lasts", "2 to 3 weeks"], ["Hair", "Natural or extensions"], ["Booking", "Appointment advised"]]),
  item("Wig install", 1200, "Wigs", "Wig fitting, styling and install.", [["Duration", "1 to 2 hours"], ["Includes", "Fit, cut and style"], ["Wig", "Bring your own"], ["Lasts", "2 to 4 weeks"], ["Booking", "Appointment required"]], { availability: "limited" }),
  item("Pedicure", 700, "Nails", "Foot soak, scrub, shaping and polish.", [["Duration", "1 hour"], ["Includes", "Soak, scrub, shaping"], ["Polish", "Choice of colours"], ["Hygiene", "Tools sterilised"], ["Booking", "Walk-in or appointment"]]),
  item("Relaxer", 1500, "Hair", "Relaxer with neutralising wash and conditioning.", [["Duration", "2 hours"], ["Includes", "Wash and conditioning"], ["Patch test", "On request"], ["Hair length", "Any"], ["Booking", "Appointment required"]]),
  item("Silk press", 1800, "Hair", "Heat-styled straight finish with protective serum.", [["Duration", "2 hours"], ["Includes", "Wash and heat protection"], ["Finish", "Smooth and straight"], ["Lasts", "1 to 2 weeks"], ["Booking", "Appointment required"]]),
  item("Gel nails", 1200, "Nails", "Gel polish cured under a lamp.", [["Duration", "1 hour"], ["Finish", "Glossy gel"], ["Lasts", "2 to 3 weeks"], ["Removal", "Soak-off available"], ["Booking", "Appointment advised"]]),
  item("Makeup", 2000, "Beauty", "Full-face makeup for events.", [["Duration", "1 hour"], ["Includes", "Foundation, eyes, lips"], ["Lashes", "Available on request"], ["Trial", "Book ahead"], ["Booking", "Appointment required"]])
];

const gym = [
  item("Day pass", 400, "Passes", "Full gym access for one day.", [["Valid for", "Same day"], ["Hours", "6am to 9pm"], ["Facilities", "Weights, cardio, showers"], ["Classes", "Not included"], ["Sign-up fee", "None"]]),
  item("Weekly pass", 1200, "Passes", "Seven days of unlimited access.", [["Valid for", "7 days"], ["Hours", "6am to 9pm"], ["Facilities", "Weights, cardio, showers"], ["Classes", "Not included"], ["Sign-up fee", "None"]]),
  item("Monthly membership", 4500, "Memberships", "Unlimited access for 30 days with group classes.", [["Valid for", "30 days"], ["Hours", "5am to 10pm"], ["Facilities", "Weights, cardio, showers, lockers"], ["Classes", "Included"], ["Induction", "Free"], ["Sign-up fee", "KSh 500"], ["Freeze", "Up to 7 days"], ["Payment", "M-Pesa or cash"], ["ID", "Required at sign-up"]], { term: "30 days" }),
  item("Quarterly membership", 12000, "Memberships", "Three months at a lower monthly rate.", [["Valid for", "90 days"], ["Hours", "5am to 10pm"], ["Facilities", "Weights, cardio, showers, lockers"], ["Classes", "Included"], ["Freeze", "Up to 14 days"]], { term: "90 days" }),
  item("Annual membership", 40000, "Memberships", "Twelve months of access at the best rate.", [["Valid for", "12 months"], ["Hours", "5am to 10pm"], ["Classes", "Included"], ["Freeze", "Up to 30 days"], ["Guest passes", "4 per year"]], { term: "12 months" }),
  item("Student monthly", 3200, "Memberships", "Discounted monthly access with a valid student ID.", [["Valid for", "30 days"], ["Hours", "6am to 9pm"], ["Classes", "Included"], ["ID", "Valid student ID"], ["Sign-up fee", "None"]], { term: "30 days" }),
  item("Couples monthly", 7500, "Memberships", "Two people on one monthly plan.", [["Valid for", "30 days"], ["People", "2"], ["Hours", "5am to 10pm"], ["Classes", "Included"], ["Sign-up fee", "KSh 500"]], { term: "30 days" }),
  item("Personal training session", 1500, "Training", "One-on-one session with a certified trainer.", [["Duration", "1 hour"], ["Trainer", "Certified"], ["Includes", "Plan and form coaching"], ["Booking", "24 hours ahead"], ["Cancel", "Free up to 12 hours before"]], { duration: "1 hour" }),
  item("Group class drop-in", 500, "Training", "Single group class without a membership.", [["Duration", "45 minutes"], ["Classes", "Circuit, aerobics, spin"], ["Level", "All levels"], ["Booking", "Walk-in if space allows"]], { duration: "45 minutes" }),
  item("Locker and towel monthly", 600, "Add-ons", "Personal locker and fresh towels for a month.", [["Valid for", "30 days"], ["Locker", "Personal, own padlock"], ["Towels", "Fresh daily"], ["Deposit", "KSh 200 refundable"]], { term: "30 days" })
];

const rx = (form, strength, pack, rxNeeded, extra = []) => [["Form", form], ["Strength", strength], ["Pack size", pack], ["Prescription", rxNeeded ? "Required" : "Not required"], ["Storage", "Cool, dry place"], ...extra];

const chemist = [
  item("Paracetamol 500mg", 40, "Pain and fever", "Pain and fever relief tablets.", rx("Tablet", "500 mg", "16 tablets", false, [["Ask first", "Check with a pharmacist for children"]]), { packSize: "16 tablets" }),
  item("Ibuprofen 400mg", 60, "Pain and fever", "Anti-inflammatory pain relief tablets.", rx("Tablet", "400 mg", "10 tablets", false, [["Ask first", "Check with a pharmacist if unsure"]]), { packSize: "10 tablets" }),
  item("Oral rehydration salts", 30, "Everyday care", "Sachet for replacing fluids and salts.", rx("Powder sachet", "Standard", "1 sachet", false, [["Preparation", "Follow the sachet instructions"]]), { packSize: "1 sachet" }),
  item("Cetirizine 10mg", 50, "Allergy", "Antihistamine tablets for allergy symptoms.", rx("Tablet", "10 mg", "10 tablets", false), { packSize: "10 tablets" }),
  item("Zinc 20mg", 80, "Everyday care", "Dispersible zinc tablets.", rx("Dispersible tablet", "20 mg", "10 tablets", false), { packSize: "10 tablets" }),
  item("Multivitamin 30 tablets", 450, "Supplements", "Daily multivitamin and mineral tablets.", rx("Tablet", "Multivitamin", "30 tablets", false, [["Shelf life", "See pack for expiry"]]), { packSize: "30 tablets" }),
  item("Amoxicillin 500mg", 180, "Prescription", "Antibiotic capsules, sold on prescription only.", rx("Capsule", "500 mg", "10 capsules", true, [["Dispensing", "By a registered pharmacist"]]), { packSize: "10 capsules", availability: "limited" }),
  item("Digital thermometer", 350, "Equipment", "Fast-read digital thermometer.", [["Type", "Digital"], ["Read time", "About 10 seconds"], ["Battery", "Included"], ["Display", "LCD"], ["Warranty", "6 months"]]),
  item("Blood pressure check", 50, "Health checks", "Quick blood pressure reading by a trained attendant.", [["Duration", "5 minutes"], ["Done by", "Trained attendant"], ["Walk-in", "Yes"], ["Records", "Reading written down on request"]], { kind: "service", duration: "5 minutes" }),
  item("Sugar test", 100, "Health checks", "Finger-prick blood sugar test.", [["Duration", "5 minutes"], ["Done by", "Trained attendant"], ["Fasting", "Tell the attendant if you have fasted"], ["Walk-in", "Yes"]], { kind: "service", duration: "5 minutes" })
];

const agro = [
  item("Certified maize seed 2kg", 650, "Seed", "Certified hybrid maize seed for the long rains.", [["Pack size", "2 kg"], ["Maturity", "120 to 140 days"], ["Germination", "90% minimum"], ["Certified", "Yes"], ["Best season", "Long rains"]], { packSize: "2 kg" }),
  item("Dairy meal 70kg", 2900, "Feeds", "Balanced dairy ration for milking cows.", [["Pack size", "70 kg"], ["Protein", "16%"], ["For", "Dairy cows"], ["Form", "Meal"], ["Storage", "Dry, off the floor"]], { packSize: "70 kg" }),
  item("DAP fertilizer 50kg", 5800, "Fertilizer", "Planting fertilizer high in phosphorus.", [["Pack size", "50 kg"], ["Use", "At planting"], ["Form", "Granules"], ["Nutrients", "N, P"], ["Storage", "Dry place"]], { packSize: "50 kg" }),
  item("CAN fertilizer 50kg", 4900, "Fertilizer", "Top-dressing fertilizer.", [["Pack size", "50 kg"], ["Use", "Top dressing"], ["Form", "Granules"], ["Nutrients", "N, Ca"], ["Storage", "Dry place"]], { packSize: "50 kg" }),
  item("Tomato seed hybrid 10g", 600, "Seed", "Hybrid tomato seed for open field or greenhouse.", [["Pack size", "10 g"], ["Type", "Hybrid"], ["Maturity", "75 to 90 days"], ["Germination", "85% minimum"], ["Grown", "Open field or greenhouse"]], { packSize: "10 g" }),
  item("Sukuma wiki seed 100g", 150, "Seed", "Open-pollinated kale seed.", [["Pack size", "100 g"], ["Type", "Open-pollinated"], ["First harvest", "6 to 8 weeks"], ["Germination", "85% minimum"]], { packSize: "100 g" }),
  item("Cattle dewormer 100ml", 450, "Animal health", "Oral dewormer for cattle.", [["Pack size", "100 ml"], ["Animal", "Cattle"], ["Form", "Oral liquid"], ["Advice", "Ask the agrovet for the right amount"], ["Storage", "Cool, dry place"]], { packSize: "100 ml" }),
  item("Acaricide 1L", 1200, "Animal health", "Tick control concentrate.", [["Pack size", "1 litre"], ["Animal", "Cattle, goats"], ["Form", "Concentrate"], ["Handling", "Wear gloves"], ["Storage", "Locked, away from children"]], { packSize: "1 litre" }),
  item("Knapsack sprayer 16L", 3200, "Equipment", "Manual backpack sprayer.", [["Capacity", "16 litres"], ["Type", "Manual lever"], ["Straps", "Padded"], ["Nozzle", "Adjustable"], ["Warranty", "3 months"]]),
  item("Layers mash 70kg", 3300, "Feeds", "Complete feed for laying hens.", [["Pack size", "70 kg"], ["For", "Laying hens"], ["Form", "Mash"], ["Protein", "16%"], ["Storage", "Dry, off the floor"]], { packSize: "70 kg" })
];

const kitchen = [
  item("Aluminium sufuria set 3 pcs", 1800, "Cookware", "Three-piece aluminium sufuria set with lids.", [["Pieces", "3 with lids"], ["Material", "Aluminium"], ["Sizes", "20, 24, 28 cm"], ["Handles", "Heat-resistant"], ["Use", "Gas or charcoal"], ["Warranty", "3 months"]]),
  item("Non-stick frying pan 28cm", 1500, "Cookware", "Non-stick pan for everyday frying.", [["Diameter", "28 cm"], ["Material", "Aluminium with coating"], ["Handle", "Cool-touch"], ["Use", "Gas or electric"], ["Care", "Wooden or plastic utensils"]]),
  item("Pressure cooker 5L", 4200, "Cookware", "Aluminium pressure cooker for beans and meat.", [["Capacity", "5 litres"], ["Material", "Aluminium"], ["Diameter", "22 cm"], ["Weight", "2.4 kg"], ["Safety", "Pressure valve and locking lid"], ["Use", "Gas or electric coil"], ["Gasket", "Replaceable"], ["Colour", "Silver"], ["Warranty", "6 months"]]),
  item("Two-burner gas cooker", 3800, "Appliances", "Tabletop two-burner gas cooker.", [["Burners", "2"], ["Body", "Stainless steel top"], ["Ignition", "Auto"], ["Gas", "LPG"], ["Dimensions", "70 x 38 cm"], ["Warranty", "6 months"]]),
  item("Thermos flask 1L", 1200, "Drinkware", "Vacuum flask that keeps drinks hot or cold.", [["Capacity", "1 litre"], ["Material", "Stainless steel"], ["Keeps hot", "Up to 12 hours"], ["Lid", "Screw cup"], ["Colour", "Assorted"]]),
  item("Stainless steel spoon set 5 pcs", 650, "Utensils", "Five cooking and serving spoons.", [["Pieces", "5"], ["Material", "Stainless steel"], ["Includes", "Spoon, ladle, slotted, turner, masher"], ["Hanging hole", "Yes"]]),
  item("Plastic basin 20L", 350, "Household", "Sturdy basin for washing and storage.", [["Capacity", "20 litres"], ["Material", "Food-grade plastic"], ["Handles", "Moulded"], ["Colour", "Assorted"]]),
  item("Water jug 2L", 400, "Drinkware", "Jug with lid for water or juice.", [["Capacity", "2 litres"], ["Material", "Plastic"], ["Lid", "Snap-on"], ["Dishwasher", "Top rack"]]),
  item("Chopping board", 450, "Utensils", "Hard-wearing board for kitchen prep.", [["Material", "Wood"], ["Size", "35 x 25 cm"], ["Thickness", "2 cm"], ["Care", "Hand wash"]], { availability: "limited" }),
  item("Kitchen knife set 6 pcs", 1600, "Utensils", "Six knives with a block.", [["Pieces", "6"], ["Blade", "Stainless steel"], ["Handle", "Plastic"], ["Block", "Included"], ["Care", "Hand wash"], ["Warranty", "3 months"]])
];

const PACKS = { barbershops: barber, salons: salon, gyms: gym, chemists: chemist, agrovets: agro, hardware: kitchen };
const SERVICE_CATEGORIES = new Set(["barbershops", "salons", "gyms", "car-wash", "tailors", "mpesa", "mechanics", "phone-repair"]);
const PADDING = [["Availability", "Ask the seller"], ["Payment", "M-Pesa or cash"], ["Contact", "WhatsApp or call"], ["Prices", "Confirm with the seller"]];

const factorOf = (index) => 1 + (((index * 7) % 5) - 2) * 0.04;
const scale = (price, factor) => (price < 100 ? Math.max(5, Math.round((price * factor) / 5) * 5) : Math.round((price * factor) / 10) * 10);

const pad = (specs) => {
  const out = [...specs];
  for (const [label, value] of PADDING) {
    if (out.length >= 4) break;
    if (!out.some((s) => s.label === label)) out.push({ label, value });
  }
  return out;
};

export const defaultKind = (categoryId) => (SERVICE_CATEGORIES.has(categoryId) ? "service" : "product");

export function completeServices(categoryId, services, index) {
  const pack = PACKS[categoryId] ?? [];
  const byName = new Map(pack.map((entry) => [entry.name.toLowerCase(), entry]));
  const merged = services.map((svc) => {
    const match = byName.get(svc.name.toLowerCase());
    if (!match) return { ...svc, specs: pad(svc.specs ?? []) };
    const specs = (svc.specs?.length ?? 0) >= 4 ? svc.specs : match.specs;
    return { ...match, ...svc, specs };
  });
  const taken = new Set(merged.map((svc) => svc.name.toLowerCase()));
  const factor = factorOf(index);
  for (const entry of pack) {
    if (taken.has(entry.name.toLowerCase())) continue;
    merged.push({ ...entry, priceKes: scale(entry.priceKes, factor) });
  }
  const ids = new Set();
  return merged.map((svc) => {
    let id = svc.id ?? slugify(svc.name);
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    return { ...svc, id };
  });
}
