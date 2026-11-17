// Catalogue coverage, part 2: health, beauty, fitness, baby, education, hospitality and professional services.
// Health services never claim medical results: rows ask for the facts a patient needs to choose (what is done, who does it, what it costs,
// whether insurance is taken). Selling restrictions stay as they are (prescription medicine, vet drugs, agrochemicals); these types are suggested through their categories.
import { ax, b, c, colour, n, o, rec, req, t, type } from "./lib.mjs";

const BRAND = { open: ["brand"] };
const SKIN = c("skin-type", "Skin type", ["All", "Dry", "Oily", "Combination", "Sensitive", "Dark skin"]);
const HAIR = c("hair-type", "Hair type", ["All", "Natural", "Relaxed", "Curly", "Straight", "Dry", "Oily", "Locs"]);

export const COVERAGE_HEALTH = [
  // ---- Chemist ------------------------------------------------------------------------------------------------------------
  type("vitamins-supplements", "Vitamins and supplements", {
    dept: "medicine-health", cats: ["chemist", "supermarket-minimart", "gym-fitness"],
    axes: [ax("pack", "Pack", { scale: "count", values: ["10", "30", "60", "90", "120"] }), ax("strength", "Strength", { display: "text-card" })],
    rows: [req(o("brand", "Brand")), req(c("form", "Form", ["Tablet", "Capsule", "Syrup", "Powder", "Gummies", "Drops"])), req(c("age", "For", ["Adults", "Children", "Pregnancy", "Seniors", "All"])), rec(t("ingredients", "Active ingredients")), rec(t("best-before", "Expiry date"))],
    x: BRAND
  }),
  type("first-aid-devices", "First aid and health devices", {
    dept: "medicine-health", cats: ["chemist", "clinic"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Thermometer", "BP monitor", "Glucometer", "Test strips", "Pulse oximeter", "Nebuliser", "Plasters", "Bandage", "Gauze", "Gloves", "Face masks", "Pregnancy test", "HIV self-test", "Wheelchair", "Crutches"] }), ax("pack", "Pack", { values: ["Single", "Pack of 10", "Box of 50", "Box of 100"] })],
    rows: [req(o("brand", "Brand")), rec(c("power", "Power", ["Battery", "Rechargeable", "Mains", "None"])), rec(t("warranty", "Warranty")), rec(t("expiry", "Expiry date")), rec(t("certification", "Approval or standards mark"))],
    x: BRAND
  }),
  type("sanitary-baby-care", "Sanitary, baby and personal care", {
    dept: "medicine-health", cats: ["chemist", "supermarket-minimart", "baby-shop"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Sanitary pads", "Tampons", "Panty liners", "Diapers", "Baby wipes", "Condoms", "Nappy rash cream", "Baby lotion", "Baby powder"] }), ax("pack", "Pack", { scale: "count", values: ["1", "8", "10", "20", "40", "64", "100"] }), ax("size", "Size", { values: ["Newborn", "Size 1", "Size 2", "Size 3", "Size 4", "Size 5", "Size 6", "Regular", "Heavy flow", "Overnight"] })],
    rows: [req(o("brand", "Brand")), rec(c("for", "For", ["Women", "Baby", "Men", "Everyone"])), rec(t("age-range", "Age or weight range")), rec(t("expiry", "Expiry date"))],
    x: BRAND
  }),
  type("skin-hair-medical", "Medicated skin and hair care", {
    dept: "medicine-health", cats: ["chemist"],
    axes: [ax("size", "Size", { scale: "volume", values: ["50 ml", "100 ml", "200 ml", "400 ml"] }), ax("form", "Form", { values: ["Cream", "Ointment", "Lotion", "Shampoo", "Soap", "Gel"] })],
    rows: [req(o("brand", "Brand")), req(c("prescription", "Prescription needed", ["No", "Yes"])), rec(SKIN), rec(t("active-ingredient", "Active ingredient")), rec(t("expiry", "Expiry date"))],
    x: BRAND
  }),
  // ---- Clinic and lab -----------------------------------------------------------------------------------------------------
  type("clinic-consultation", "Clinic consultation", {
    dept: "medicine-health", cats: ["clinic"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["General consultation", "Specialist consultation", "Antenatal visit", "Postnatal visit", "Child welfare", "Family planning", "Follow-up visit", "Medical certificate"] }), ax("mode", "Mode", { values: ["In clinic", "Home visit", "Telemedicine"] })],
    rows: [req(t("clinician", "Who attends (doctor, clinical officer, nurse)")), req(t("licence", "Facility licence number")), req(c("booking", "Booking", ["Walk-in", "Appointment", "Either"])), rec(t("insurance", "Insurance accepted (SHA, private)")), rec(b("emergency", "Emergency care")), rec(b("open-24h", "Open 24 hours"))],
    x: { priceRule: "per-visit" }
  }),
  type("lab-test", "Lab test", {
    dept: "medicine-health", cats: ["clinic", "chemist"], kind: "service",
    axes: [ax("test", "Test", { display: "text-card", values: ["Malaria", "Full haemogram", "Blood sugar", "Urinalysis", "HIV test", "Typhoid", "Pregnancy test", "Lipid profile", "Liver function", "Kidney function", "COVID-19", "Stool analysis"] }), ax("results", "Results in", { values: ["While you wait", "Same day", "24 hours", "2 to 3 days"] })],
    rows: [req(t("sample", "Sample needed")), req(b("fasting", "Fasting needed")), rec(b("lab-on-site", "Done on site")), rec(b("home-sample", "Home sample collection")), rec(t("insurance", "Insurance accepted"))],
    x: {}
  }),
  type("vaccination", "Vaccination", {
    dept: "medicine-health", cats: ["clinic", "chemist"], kind: "service",
    axes: [ax("vaccine", "Vaccine", { display: "text-card", values: ["Childhood schedule", "Yellow fever", "Typhoid", "Hepatitis B", "HPV", "Tetanus", "Flu", "Rabies", "Meningitis", "Travel vaccine"] }), ax("who", "For", { values: ["Infant", "Child", "Adult", "Pregnant"] })],
    rows: [req(t("doses", "Doses needed")), req(t("clinician", "Given by")), rec(b("certificate", "Certificate issued")), rec(t("insurance", "Insurance accepted"))],
    x: {}
  }),
  type("dental-service", "Dental service", {
    dept: "medicine-health", cats: ["clinic"], kind: "service",
    axes: [ax("service", "Treatment", { display: "text-card", values: ["Check-up", "Cleaning", "Filling", "Extraction", "Root canal", "Braces", "Whitening", "Crown", "Dentures", "X-ray"] }), ax("age", "Patient", { values: ["Adult", "Child"] })],
    rows: [req(t("dentist", "Dentist (name and licence)")), rec(t("duration", "Duration")), rec(t("insurance", "Insurance accepted")), rec(b("emergency", "Emergency dental care")), rec(b("payment-plan", "Payment plan"))],
    x: {}
  }),
  type("maternity-physio", "Maternity, physiotherapy and other clinic services", {
    dept: "medicine-health", cats: ["clinic"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Antenatal package", "Delivery package", "Ultrasound", "Physiotherapy session", "Counselling", "Nutrition consult", "Eye check", "ENT check", "Minor surgery"] }), ax("mode", "Mode", { values: ["In clinic", "Home visit", "Online"] })],
    rows: [req(t("specialist", "Who attends")), req(t("licence", "Facility licence number")), rec(t("duration", "Session length")), rec(t("insurance", "Insurance accepted"))],
    x: {}
  }),
  // ---- Optician -----------------------------------------------------------------------------------------------------------
  type("lenses", "Spectacle lenses", {
    dept: "eyewear", cats: ["optician"],
    axes: [ax("lens", "Lens type", { values: ["Single vision", "Bifocal", "Progressive", "Reading", "Blue-light filter", "Photochromic", "Polarised"] }), ax("index", "Index", { values: ["1.50", "1.56", "1.60", "1.67", "1.74"] }), ax("coating", "Coating", { values: ["None", "Anti-glare", "Scratch resistant", "UV protection"] })],
    rows: [req(c("fit", "Fit", ["Fitted into your frame", "Lenses only"])), req(t("prescription-range", "Prescription range covered")), rec(o("brand", "Brand")), rec(t("ready-in", "Ready in")), rec(b("same-day", "Same-day glasses"))],
    x: BRAND
  }),
  type("contact-lenses", "Contact lenses", {
    dept: "eyewear", cats: ["optician"],
    axes: [ax("type", "Wear", { values: ["Daily", "Monthly", "Yearly", "Coloured", "Toric", "Multifocal"] }), ax("pack", "Pack", { scale: "count", values: ["2", "6", "30", "90"] }), colour("Lens colour")],
    rows: [req(o("brand", "Brand")), req(t("power-range", "Power range")), rec(t("base-curve", "Base curve")), rec(t("solution", "Solution included"))],
    x: BRAND
  }),
  type("eye-test", "Eye test", {
    dept: "eyewear", cats: ["optician"], kind: "service",
    axes: [ax("test", "Test", { values: ["Basic eye test", "Comprehensive exam", "Children's eye test", "Contact lens fitting", "Glaucoma screening"] })],
    rows: [req(t("optometrist", "Optometrist")), rec(b("free-with-purchase", "Free with a purchase")), rec(t("duration", "Duration")), rec(t("insurance", "Insurance accepted"))],
    x: {}
  }),
  // ---- Barber, salon, spa -------------------------------------------------------------------------------------------------
  type("kids-haircut", "Kids' haircut", {
    dept: "beauty-personal-care", cats: ["barbershop", "salon-beauty"], kind: "service",
    axes: [ax("age", "Age", { values: ["Under 5", "5 to 12", "Teen"] }), ax("style", "Style", { values: ["Low cut", "Fade", "Taper", "Shave", "Plaits"] })],
    rows: [rec(t("duration", "Duration")), rec(b("kid-friendly", "Kid-friendly space")), rec(b("home-service", "Home service"))],
    x: {}
  }),
  type("grooming-products", "Hair and beard products", {
    dept: "beauty-personal-care", cats: ["barbershop", "salon-beauty", "supermarket-minimart"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Beard oil", "Pomade", "Clipper", "Trimmer", "Razor", "Aftershave", "Hair dye", "Shaving cream", "Hair brush"] }), ax("size", "Size", { values: ["Small", "Medium", "Large"] })],
    rows: [req(o("brand", "Brand")), rec(t("size-ml", "Volume or weight")), rec(c("power", "Power", ["Corded", "Cordless", "Manual"])), rec(t("warranty", "Warranty"))],
    x: BRAND
  }),
  type("braiding-service", "Braids, locs and hair styling", {
    dept: "beauty-personal-care", cats: ["salon-beauty"], kind: "service",
    axes: [ax("style", "Style", { display: "text-card", values: ["Box braids", "Knotless braids", "Cornrows", "Twists", "Crochet", "Locs", "Fulani braids", "Wig install", "Weave", "Silk press", "Relaxer"] }), ax("length", "Length", { values: ["Short", "Shoulder", "Mid-back", "Waist", "Bum length"] }), ax("size", "Size", { values: ["Small", "Medium", "Large", "Jumbo"] })],
    rows: [req(t("duration", "How long it takes")), req(c("hair-supplied", "Hair", ["Your own hair", "Hair included", "Either"])), rec(b("home-service", "Home service")), rec(b("bridal", "Bridal package")), rec(c("stylist", "Stylist", ["Any", "Female", "Male"]))],
    x: { priceGrid: ["style", "length"] }
  }),
  type("nails-service", "Nails and pedicure", {
    dept: "beauty-personal-care", cats: ["salon-beauty", "spa-massage"], kind: "service",
    axes: [ax("service", "Service", { values: ["Manicure", "Pedicure", "Gel polish", "Acrylic set", "Gel extensions", "Nail art", "Removal", "Spa pedicure"] }), ax("length", "Length", { values: ["Short", "Medium", "Long"] })],
    rows: [req(t("duration", "How long it takes")), rec(b("home-service", "Home service")), rec(b("bridal", "Bridal package")), rec(t("products", "Products used"))],
    x: {}
  }),
  type("makeup-service", "Makeup and bridal beauty", {
    dept: "beauty-personal-care", cats: ["salon-beauty"], kind: "service",
    axes: [ax("occasion", "Occasion", { values: ["Everyday", "Party", "Bridal", "Photoshoot", "Graduation", "Bridesmaids"] }), ax("trial", "Includes", { values: ["Makeup only", "Makeup and lashes", "Makeup and hair", "Full bridal package"] })],
    rows: [req(t("duration", "How long it takes")), req(b("home-service", "Travels to you")), rec(t("travel-cost", "Travel cost")), rec(t("brands", "Products used")), rec(t("deposit", "Booking deposit"))],
    x: {}
  }),
  type("spa-package-membership", "Spa package and membership", {
    dept: "beauty-personal-care", cats: ["spa-massage"], kind: "package",
    axes: [ax("package", "Package", { values: ["Couples package", "Bridal spa", "Day pass", "Monthly membership", "10-session pass", "Gift voucher"] }), ax("people", "People", { scale: "count", values: ["1", "2", "4", "6"] })],
    rows: [req(t("includes", "What is included")), req(t("valid-for", "Valid for")), rec(b("appointment", "Appointment needed")), rec(t("hours", "Gender-specific hours"))],
    x: {}
  }),
  type("sauna-steam", "Sauna and steam", {
    dept: "beauty-personal-care", cats: ["spa-massage", "gym-fitness"], kind: "service",
    axes: [ax("kind", "Session", { values: ["Sauna", "Steam room", "Sauna and steam", "Jacuzzi", "Cold plunge"] }), ax("duration", "Duration", { scale: "duration", values: ["30 min", "60 min", "90 min"] })],
    rows: [req(c("access", "Access", ["Private", "Shared"])), rec(c("gender", "Gender", ["Mixed", "Ladies only", "Gents only"])), rec(b("towels", "Towels provided"))],
    x: {}
  }),
  // ---- Cosmetics and hair products ----------------------------------------------------------------------------------------
  type("hair-care-products", "Hair care products", {
    dept: "beauty-personal-care", cats: ["cosmetics-beauty-products", "salon-beauty", "supermarket-minimart"],
    axes: [ax("item", "Product", { display: "text-card", values: ["Shampoo", "Conditioner", "Hair food", "Hair oil", "Relaxer kit", "Gel", "Edge control", "Hair dye", "Braiding hair", "Hair clips and bands"] }), ax("size", "Size", { scale: "volume", values: ["100 ml", "250 ml", "400 ml", "500 ml", "1 L"] })],
    rows: [req(o("brand", "Brand")), req(HAIR), rec(t("ingredients", "Key ingredients")), rec(b("sulphate-free", "Sulphate-free")), rec(t("expiry", "Expiry date"))],
    x: BRAND
  }),
  type("body-care-lotions", "Body care, soaps and lotions", {
    dept: "beauty-personal-care", cats: ["cosmetics-beauty-products", "supermarket-minimart", "chemist"],
    axes: [ax("item", "Product", { display: "text-card", values: ["Body lotion", "Body butter", "Shower gel", "Bar soap", "Deodorant", "Sunscreen", "Lip balm", "Hand wash", "Petroleum jelly"] }), ax("size", "Size", { scale: "volume", values: ["50 ml", "100 ml", "250 ml", "400 ml", "1 L"] }), ax("scent", "Scent", { open: "flavour" })],
    rows: [req(o("brand", "Brand")), req(SKIN), rec(t("spf", "SPF")), rec(t("ingredients", "Key ingredients")), rec(t("expiry", "Expiry date"))],
    x: { open: ["brand", "flavour"] }
  }),
  type("nail-lash-tools", "Nail, lash and makeup tools", {
    dept: "beauty-personal-care", cats: ["cosmetics-beauty-products", "salon-beauty"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Nail polish", "Gel polish", "Acrylic kit", "UV lamp", "False nails", "Eyelashes", "Lash glue", "Makeup brush set", "Sponge", "Mirror"] }), colour()],
    rows: [req(o("brand", "Brand")), rec(t("pack", "Pieces in pack")), rec(t("shade", "Shade name")), rec(b("vegan", "Vegan or cruelty-free"))],
    x: { open: ["brand", "colour"] }
  }),
  // ---- Fitness ------------------------------------------------------------------------------------------------------------
  type("gym-class-training", "Gym classes and personal training", {
    dept: "fitness", cats: ["gym-fitness"], kind: "service",
    axes: [ax("kind", "Session", { values: ["Personal training", "Group class", "Aerobics", "Yoga", "Zumba", "Crossfit", "Spinning", "Boxing", "Swimming lesson", "Karate"] }), ax("sessions", "Sessions", { scale: "count", values: ["1", "4", "8", "12", "20"] })],
    rows: [req(t("trainer", "Trainer")), req(t("schedule", "Class times")), rec(c("gender", "Open to", ["Mixed", "Ladies only", "Gents only"])), rec(t("level", "Level")), rec(t("max-class", "Class size limit"))],
    x: { priceRule: "quantity-packs" }
  }),
  type("fitness-equipment", "Fitness equipment and sportswear", {
    dept: "fitness", cats: ["gym-fitness", "fashion-boutiques"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Dumbbells", "Barbell", "Weight plates", "Kettlebell", "Treadmill", "Exercise bike", "Yoga mat", "Skipping rope", "Resistance bands", "Football", "Gym gloves", "Protein shaker"] }), ax("weight", "Weight", { scale: "weight", values: ["1 kg", "2 kg", "5 kg", "10 kg", "20 kg"] }), colour()],
    rows: [req(o("brand", "Brand")), rec(t("material", "Material")), rec(t("max-user", "Maximum user weight")), rec(t("warranty", "Warranty")), rec(b("delivery", "Delivery and setup"))],
    x: { open: ["brand", "colour"] }
  }),
  // ---- Baby shop ----------------------------------------------------------------------------------------------------------
  type("baby-gear", "Baby gear (cots, strollers, car seats)", {
    dept: "fitness", cats: ["baby-shop"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Cot", "Stroller", "Car seat", "High chair", "Baby bath", "Walker", "Carrier", "Playpen", "Changing mat", "Bouncer"] }), colour()],
    rows: [req(o("brand", "Brand")), req(t("age-range", "Suitable age or weight")), rec(t("dimensions", "Dimensions")), rec(t("safety", "Safety standard")), rec(t("warranty", "Warranty"))],
    x: { open: ["brand", "colour"] }
  }),
  type("baby-clothing", "Baby and toddler clothing", {
    dept: "clothing", cats: ["baby-shop", "fashion-boutiques", "tailor-boutique"],
    axes: [colour(), ax("age", "Age", { values: ["Newborn", "0 to 3 months", "3 to 6 months", "6 to 12 months", "1 to 2 years", "2 to 3 years"] }), ax("pack", "Pack", { scale: "count", values: ["1", "3", "5", "7"] })],
    rows: [req(c("gender", "For", ["Girl", "Boy", "Unisex"])), req(o("material", "Fabric")), rec(c("condition", "Condition", ["New", "Mitumba (used)"])), rec(t("care", "Care"))],
    x: { open: ["colour", "material"], sizeChart: "kids" }
  }),
  type("baby-feeding-toys", "Feeding, toys and nursery", {
    dept: "fitness", cats: ["baby-shop"],
    axes: [ax("item", "Item", { display: "text-card", values: ["Feeding bottle", "Sterilizer", "Breast pump", "Pacifier", "Teether", "Soft toy", "Building blocks", "Baby blanket", "Mosquito net", "Night light"] }), ax("size", "Size", { values: ["Small", "Medium", "Large"] })],
    rows: [req(o("brand", "Brand")), req(t("age-range", "Suitable age")), rec(t("material", "Material (BPA-free?)")), rec(t("safety", "Safety standard"))],
    x: BRAND
  }),
  // ---- Education and childcare --------------------------------------------------------------------------------------------
  type("tuition-lessons", "Tuition and lessons", {
    dept: "photography-events", cats: ["tuition-daycare"], kind: "service",
    axes: [ax("level", "Level", { values: ["Nursery", "Lower primary", "Upper primary", "Junior secondary", "Senior secondary", "College", "Adult"] }), ax("subject", "Subject", { display: "text-card", values: ["Maths", "English", "Kiswahili", "Science", "Chemistry", "Physics", "Biology", "Business", "Coding", "Languages", "Music"] }), ax("format", "Format", { values: ["Individual", "Small group", "Class", "Online", "Home visit"] })],
    rows: [req(c("curriculum", "Curriculum", ["CBC", "8-4-4", "IGCSE", "IB", "Other"])), req(t("schedule", "Days and times")), rec(c("billing", "Fee is per", ["Hour", "Lesson", "Month", "Term"])), rec(b("trial", "Trial lesson")), rec(t("tutor-qualification", "Tutor qualification"))],
    x: { priceGrid: ["level", "format"] }
  }),
  type("daycare-childcare", "Daycare and childcare", {
    dept: "photography-events", cats: ["tuition-daycare"], kind: "package",
    axes: [ax("age", "Age group", { values: ["Under 1", "1 to 2 years", "2 to 3 years", "3 to 5 years", "After school (5 to 12)"] }), ax("plan", "Plan", { values: ["Full day", "Half day", "After school", "Holiday care", "Hourly"] })],
    rows: [req(t("hours", "Opening hours")), req(b("registered", "Registered with the county")), rec(b("meals", "Meals included")), rec(b("transport", "Transport offered")), rec(t("ratio", "Children per carer"))],
    x: {}
  }),
  type("driving-school", "Driving school and licences", {
    dept: "photography-events", cats: ["tuition-daycare"], kind: "package",
    axes: [ax("class", "Licence class", { values: ["Class B (car)", "Class A (motorbike)", "Class C (light truck)", "Class D (PSV)", "Refresher"] }), ax("package", "Package", { values: ["Theory only", "Lessons only", "Full course with test", "Hourly lesson"] })],
    rows: [req(t("duration", "Course length")), req(b("registered", "NTSA registered")), rec(c("car", "Car", ["Manual", "Automatic", "Both"])), rec(b("pickup", "Pickup")), rec(b("test-booking", "Test booking included"))],
    x: {}
  }),
  type("computer-music-classes", "Computer, music and skills classes", {
    dept: "photography-events", cats: ["tuition-daycare", "cyber-cafe"], kind: "service",
    axes: [ax("course", "Course", { display: "text-card", values: ["Computer basics", "Microsoft Office", "Graphic design", "Web design", "Coding", "Piano", "Guitar", "Singing", "Dance", "Sewing", "Baking"] }), ax("format", "Format", { values: ["Individual", "Group", "Online", "Weekend"] })],
    rows: [req(t("duration", "Course length")), req(t("schedule", "Days and times")), rec(b("certificate", "Certificate")), rec(b("trial", "Trial lesson")), rec(b("equipment", "Equipment provided"))],
    x: {}
  }),
  type("books-textbooks", "Books and textbooks", {
    dept: "stationery", cats: ["bookshop", "printing-stationery"],
    axes: [ax("level", "Level", { values: ["Pre-primary", "Primary", "Junior secondary", "Senior secondary", "College", "University", "General"] }), ax("format", "Format", { values: ["Paperback", "Hardback", "Spiral", "Set of books"] }), ax("condition", "Condition", { values: ["New", "Used"] })],
    rows: [req(t("author", "Author")), req(o("brand", "Publisher")), req(t("subject", "Subject")), rec(c("curriculum", "Curriculum", ["CBC", "8-4-4", "IGCSE", "University", "General"])), rec(t("isbn", "ISBN"))],
    x: { open: ["brand"] }
  }),
  type("storybooks-general", "Storybooks, novels and general books", {
    dept: "stationery", cats: ["bookshop"],
    axes: [ax("format", "Format", { values: ["Paperback", "Hardback", "Board book"] }), ax("condition", "Condition", { values: ["New", "Used"] })],
    rows: [req(t("author", "Author")), req(c("genre", "Genre", ["Children", "Fiction", "Non-fiction", "Religious", "Self-help", "Business", "Cooking", "Local authors"])), rec(o("brand", "Publisher")), rec(t("language", "Language")), rec(t("isbn", "ISBN"))],
    x: { open: ["brand"] }
  }),
  // ---- M-Pesa and agent services ------------------------------------------------------------------------------------------
  type("mpesa-agent-service", "M-Pesa and agent banking services", {
    dept: "photography-events", cats: ["mpesa-airtime-agent"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["M-Pesa deposit", "M-Pesa withdrawal", "Airtel Money", "Bank agency", "Pay bill", "Buy goods", "Send money", "Cash advance"] }), ax("network", "Network", { values: ["Safaricom", "Airtel", "Telkom", "Bank"] })],
    rows: [req(t("agent-number", "Agent or till number")), req(t("float", "Float available up to")), rec(b("open-24h", "Open 24 hours")), rec(t("fees", "Fees"))],
    x: {}
  }),
  type("airtime-bills-tokens", "Airtime, bundles and bill payment", {
    dept: "photography-events", cats: ["mpesa-airtime-agent"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Airtime", "Data bundles", "SMS bundles", "KPLC tokens", "Water bill", "DStv", "Zuku", "StarTimes", "School fees", "NHIF and SHA", "KRA payment"] }), ax("network", "Network", { values: ["Safaricom", "Airtel", "Telkom", "Any"] })],
    rows: [req(b("instant", "Instant")), rec(t("fees", "Service fee")), rec(t("minimum", "Minimum amount")), rec(t("bills", "Bills supported"))],
    x: {}
  }),
  // ---- Hotels, property, professional services ----------------------------------------------------------------------------
  type("hotel-room", "Hotel or lodge room", {
    dept: "photography-events", cats: ["hotels-lodging"], kind: "package",
    axes: [ax("room", "Room", { values: ["Single", "Double", "Twin", "Bedsitter", "Family room", "Suite", "Dormitory"] }), ax("meal", "Meals", { values: ["Room only", "Bed and breakfast", "Half board", "Full board"] }), ax("guests", "Guests", { scale: "count", values: ["1", "2", "3", "4", "6"] })],
    rows: [req(c("price-per", "Price is per", ["Night", "Person per night", "Hour", "Week", "Month"])), req(t("check-in", "Check-in and check-out time")), rec(t("amenities", "Amenities (WiFi, hot water, parking)")), rec(b("security", "24 hour security")), rec(b("pets", "Pets allowed"))],
    x: { priceGrid: ["room", "meal"] }
  }),
  type("conference-venue", "Conference hall and meeting room", {
    dept: "photography-events", cats: ["hotels-lodging", "event-hire"], kind: "package",
    axes: [ax("capacity", "Capacity", { scale: "count", values: ["10", "20", "50", "100", "200", "500"] }), ax("layout", "Layout", { values: ["Theatre", "Classroom", "Boardroom", "Banquet", "U-shape"] }), ax("duration", "Booking", { values: ["Hour", "Half day", "Full day", "Weekend"] })],
    rows: [req(t("includes", "What is included")), rec(b("projector", "Projector and screen")), rec(b("catering", "Catering available")), rec(b("parking", "Parking")), rec(b("generator", "Backup power"))],
    x: {}
  }),
  type("property-rental", "Property for rent", {
    dept: "photography-events", cats: ["rentals-real-estate"], kind: "package",
    axes: [ax("house", "Type", { values: ["Single room", "Bedsitter", "1 bedroom", "2 bedroom", "3 bedroom", "4 bedroom and above", "Shop", "Office", "Warehouse", "Stall"] }), ax("furnished", "Furnishing", { values: ["Unfurnished", "Semi-furnished", "Furnished"] })],
    rows: [req(c("price-per", "Rent is per", ["Month", "Week", "Night", "Year"])), req(t("location", "Estate and town")), req(t("deposit", "Deposit required")), rec(t("utilities", "Water, security, garbage")), rec(t("available-from", "Available from"))],
    x: {}
  }),
  type("property-sale", "Property and land for sale", {
    dept: "photography-events", cats: ["rentals-real-estate"], kind: "package",
    axes: [ax("kind", "Type", { values: ["House", "Apartment", "Land plot", "Farm", "Commercial building", "Shop"] }), ax("size", "Size", { values: ["1/8 acre", "1/4 acre", "1/2 acre", "1 acre", "5 acres and above"] })],
    rows: [req(t("location", "Location")), req(c("title", "Title", ["Freehold", "Leasehold", "Allotment letter", "Share certificate"])), req(c("sale", "Sale", ["Cash", "Instalments", "Either"])), rec(t("bedrooms", "Bedrooms")), rec(b("viewing", "Viewing arranged"))],
    x: {}
  }),
  type("professional-consultation", "Professional services (legal, accounting, architecture)", {
    dept: "photography-events", cats: ["professional-services"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Legal consultation", "Contract drafting", "Company registration", "Tax returns", "Bookkeeping", "Audit", "Architectural drawings", "Land survey", "Valuation", "Business plan", "HR and payroll"] }), ax("mode", "Mode", { values: ["Office visit", "Online", "Phone", "Site visit"] })],
    rows: [req(t("specialty", "Specialty")), req(t("registration", "Licence or professional number (LSK, ICPAK, BORAQS)")), rec(c("billing", "Fee is", ["Fixed", "Per hour", "On quote"])), rec(b("free-first", "Free first consultation")), rec(t("languages", "Languages"))],
    x: { priceRule: "per-visit" }
  })
];
