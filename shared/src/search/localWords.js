const DIRECTIONAL = {
  simu: ["phone", "smartphone"], kiatu: ["shoe", "sandal", "sneaker"], viatu: ["shoe", "sandal", "sneaker"], nguo: ["clothes", "dress", "shirt", "trouser", "top"],
  unga: ["flour"], sukari: ["sugar"], mchele: ["rice"], mafuta: ["oil"], mkate: ["bread"], maziwa: ["milk"], chai: ["tea"], nyama: ["meat", "beef", "goat", "chicken"],
  samaki: ["fish", "tilapia"], kuku: ["chicken"], mayai: ["egg"], viazi: ["potato"], nyanya: ["tomato"], vitunguu: ["onion"], sukuma: ["kale"], maharagwe: ["bean"],
  mboga: ["vegetable", "kale", "cabbage", "spinach"], matunda: ["fruit"], maji: ["water"], begi: ["bag", "handbag"], mkoba: ["bag", "handbag"], saa: ["watch"],
  kiti: ["chair"], meza: ["table"], kitanda: ["bed"], godoro: ["mattress"], kinyozi: ["barber", "haircut", "shave", "beard"], nywele: ["hair"], kusuka: ["braid", "cornrow", "twist"],
  msuko: ["braid", "cornrow", "twist"], braiding: ["braid", "cornrow", "twist"], braid: ["cornrow", "twist"], weave: ["wig", "extension"], wig: ["weave"], gari: ["car"], pikipiki: ["motorbike", "motorcycle", "boda"],
  boda: ["motorbike", "motorcycle"], baiskeli: ["bicycle", "bike"], friji: ["fridge", "refrigerator"], jokofu: ["fridge", "refrigerator"], fridge: ["freezer"], runinga: ["tv", "television"],
  redio: ["radio"], kompyuta: ["computer", "laptop"], lappy: ["laptop"], compy: ["computer", "laptop"], mtumba: ["used", "refurbished"], mabati: ["roofing"],
  cherehani: ["sewing", "tailor"], fundi: ["tailor", "mechanic", "plumber", "electrician", "carpenter", "repair"], plumber: ["plumbing", "pipe"], plumbing: ["plumber", "pipe"],
  electrician: ["electrical", "wiring"], carpenter: ["carpentry", "furniture", "timber"], mechanic: ["garage", "repair"], garage: ["mechanic", "repair"], photographer: ["photography", "photo", "video"],
  photography: ["photographer", "photo", "video"], catering: ["caterer"], caterer: ["catering"], dj: ["mc"], mc: ["dj"], wifi: ["internet", "router"],
  internet: ["wifi", "router"], rent: ["hire", "rental"], rental: ["hire", "rent"], cleaner: ["cleaning"], bt: ["bluetooth"], airpod: ["earbud", "earphone"], earpod: ["earbud", "earphone"],
  kicks: ["sneaker", "shoe"], heel: ["shoe"], makeup: ["cosmetic"], cosmetic: ["makeup"], mattress: ["bed"], bicycle: ["bike"], bike: ["bicycle"], hairdresser: ["salon", "hair"], salon: ["hair", "beauty"],
  chips: ["fries", "potato"], maandazi: ["mandazi"], mandazi: ["maandazi"], ugali: ["flour", "unga"], pilau: ["rice"], nduthi: ["motorbike", "boda"], matatu: ["transport", "van"], jiko: ["cooker", "stove", "charcoal"]
};

// Words a shopper treats as the same thing. Each set is symmetrical: any word finds the others. One word each (the matcher compares
// word by word), spelled the way people type them in Kenya: English, Swahili, sheng and the names of trades and shops.
const SETS = [
  // repairs and trades
  ["fix", "repair", "mend", "fundi"], ["broken", "faulty", "damaged", "cracked", "spoilt"], ["screen", "display", "lcd"],
  ["plumber", "plumbing"], ["electrician", "wiring", "electrical", "socket"], ["welder", "welding", "fabrication", "fabricator", "grill", "gate"],
  ["carpenter", "carpentry", "joiner", "woodwork", "mbao"], ["mason", "builder", "construction", "contractor", "jengo"], ["painter", "painting", "paint", "emulsion", "varnish"],
  ["tailor", "seamstress", "dressmaker", "dressmaking", "alteration", "cherehani"], ["cobbler", "shoemaker", "mshonaji"], ["mechanic", "garage", "mekanik"],
  // phones, computers, office
  ["phone", "simu", "mobile", "cellphone", "smartphone", "handset"], ["charger", "adapter", "adaptor", "chaja"], ["cable", "waya"], ["powerbank"],
  ["earphone", "earbud", "headphone", "headset", "handsfree", "earpiece"], ["tablet", "ipad"], ["computer", "pc", "desktop", "kompyuta"], ["laptop", "notebook", "lappy", "macbook", "chromebook"],
  ["printer", "printing", "print", "photocopy", "photocopier", "copier", "xerox"], ["toner", "cartridge"], ["router", "modem", "wifi", "internet"],
  ["cctv", "camera", "surveillance", "security", "alarm"], ["flash", "usb", "thumbdrive"], ["monitor", "screen"], ["mouse", "mice"], ["keyboard"],
  ["airtime"], ["mpesa"], ["lamination", "laminate", "laminating"], ["binding", "spiral"],
  // clothes, shoes, bags
  ["shirt", "tshirt", "tee", "polo"], ["blouse", "tops"], ["dress", "gown", "frock", "maxi"], ["trouser", "pant", "slack", "chino"], ["jean", "denim"],
  ["jacket", "coat", "blazer", "bomber"], ["pullover", "hoodie", "cardigan", "sweatshirt"], ["suit", "tuxedo"], ["leso", "kanga", "lesso"], ["kitenge", "ankara", "african"],
  ["sneaker", "trainer", "takkies"], ["sandal", "slipper", "flipflop", "kandambili"], ["boot", "gumboot", "timberland"], ["heel", "stiletto"],
  ["bag", "handbag", "purse", "tote", "mkoba", "begi"], ["backpack", "rucksack", "schoolbag"], ["wallet", "cardholder"], ["belt", "mkanda"], ["beanie"],
  ["sock", "stocking", "soksi"], ["underwear", "brief", "boxer", "panty", "bra", "lingerie", "innerwear"], ["uniform", "regalia"], ["jewellery", "jewelry", "ornament", "accessory", "accessories"],
  ["earring", "necklace", "bracelet", "pendant"], ["watch", "saa", "wristwatch"], ["glasses", "spectacle", "eyeglass", "eyewear", "shades", "sunglass"], ["lens"],
  // home, furniture, kitchen
  ["sofa", "couch", "settee", "seater", "kochi"], ["wardrobe", "closet", "cupboard", "kabati"], ["kitanda", "bunk"], ["mattress", "godoro", "foam"], ["blanket", "duvet", "comforter", "blanketi"],
  ["bedsheet", "bedding", "linen"], ["curtain", "drape", "blind", "pazia"], ["shelf", "rack", "shelves", "bookcase"], ["meza"], ["chair", "kiti"],
  ["oil", "mafuta", "lubricant"], ["hat", "kofia", "beanie", "cap"], ["house", "apartment", "flat", "bedsitter", "bedsit", "maisonette", "bungalow", "nyumba"], ["hire", "rental", "rent", "kodi"], ["bed", "kitanda", "bunk"], ["table", "meza", "desk"], ["chair", "kiti", "stool"], ["cup", "mug", "kikombe", "tumbler"], ["light", "bulb", "lamp", "taa", "led"], ["washing", "laundry", "dryclean", "mamafua"], ["spare", "spares", "parts"], ["pump", "borehole"], ["feed", "fodder", "pellets", "mash"], ["chips", "fries"], ["agent", "mpesa", "pesa", "withdraw", "deposit"], ["sufuria", "pot", "saucepan", "cookware"], ["kettle", "jug"], ["blender", "mixer", "grinder", "juicer"], ["cooker", "stove", "jiko", "hob"], ["fridge", "refrigerator", "freezer", "jokofu", "friji"],
  ["microwave"], ["pasi"], ["plate", "dish", "sahani", "cutlery", "spoon", "fork", "knife", "kisu", "kijiko"], ["mug", "glassware", "tumbler", "kikombe"],
  ["bucket", "ndoo", "basin", "karai"], ["broom", "mop", "brush", "ufagio"], ["carpet", "rug", "zulia"], ["tv", "television", "runinga", "screen"], ["radio", "redio"],
  ["speaker", "soundbar", "woofer", "subwoofer", "spika"], ["fan", "feni", "cooler", "ventilator"], ["heater", "geyser", "boiler"],
  // building and hardware
  ["cement", "bamburi", "simenti"], ["nail", "misumari", "screw"], ["tile", "ceramic", "porcelain", "vigae"], ["pipe", "pvc", "conduit", "bomba"], ["roofing", "mabati"],
  ["timber", "wood", "plank", "lumber", "mbao"], ["door", "mlango"], ["window", "dirisha", "glass"], ["lock", "padlock", "kufuli", "latch"], ["bulb", "lamp", "led", "taa"],
  ["sand", "ballast", "aggregate", "quarry", "mawe"], ["steel", "rebar", "chuma", "y12"], ["generator", "genset"], ["solar", "panel", "inverter", "jua"], ["battery", "accumulator", "betri"],
  ["tank", "tanki", "jerrycan", "container"], ["borehole"], ["gas", "lpg", "cylinder", "gesi"], ["charcoal", "makaa", "firewood", "kuni", "briquette"],
  // auto and transport
  ["tyre", "tire", "wheel", "rim", "tairi"], ["mafuta"], ["brake", "disc", "breki"], ["spares", "parts"], ["motorbike", "motorcycle", "boda", "bodaboda", "nduthi", "pikipiki"],
  ["bicycle", "bike", "baiskeli", "cycle"], ["car", "gari", "vehicle", "saloon", "suv"], ["taxi", "cab", "uber"], ["courier", "parcel", "package", "logistics", "deliveries"],
  ["mover", "relocation", "removal", "haulage", "lorry", "truck"], ["carwash", "detailing", "valet", "carwashing"], ["matatu", "shuttle", "psv"],
  // food and drink
  ["bread", "mkate", "loaf", "baguette", "scone"], ["cake", "cakes", "cupcake", "keki", "gateau", "pastry"], ["mandazi", "maandazi", "doughnut", "donut"], ["chapati", "chapo", "chapatti"],
  ["milk", "maziwa", "mala", "yoghurt", "yogurt"], ["egg", "mayai", "eggs"], ["meat", "nyama", "butcher"], ["beef", "steak", "ngombe", "mince"], ["goat", "mbuzi", "mutton"],
  ["chicken", "kuku", "poultry", "kienyeji"], ["fish", "samaki", "tilapia", "omena", "nilePerch", "sardine"], ["sugar", "sukari"], ["flour", "unga", "atta", "ugali", "maize", "posho"],
  ["rice", "mchele", "pilau", "basmati"], ["bean", "maharagwe", "githeri", "ndengu", "lentil"], ["cooking", "mafuta", "margarine"], ["tea", "chai", "kericho"],
  ["coffee", "kahawa", "espresso", "latte", "cappuccino"], ["juice", "smoothie", "squash", "cordial"], ["soda", "fizzy", "coke", "fanta", "sprite", "pepsi"], ["water", "maji", "refill"],
  ["beer", "bia", "lager", "tusker", "pilsner", "guinness"], ["wine", "vino", "champagne"], ["whisky", "whiskey", "vodka", "gin", "brandy", "spirit", "liquor", "alcohol", "pombe"],
  ["vegetable", "mboga", "veggie", "veg"], ["kale", "sukuma"], ["tomato", "nyanya"], ["onion", "vitunguu"], ["potato", "viazi", "irish"], ["banana", "ndizi", "matoke"],
  ["avocado", "parachichi", "avo"], ["mango", "embe"], ["pawpaw", "papaya", "paw"], ["orange", "chungwa"], ["cabbage", "kabichi"], ["cassava", "muhogo"], ["arrowroot", "nduma"],
  ["fruit", "matunda"], ["restaurant", "cafe", "eatery", "kibanda", "canteen", "diner", "lunch", "dinner", "breakfast", "takeaway", "takeout"],
  ["nyama", "choma", "roast", "bbq", "grill"], ["fastfood", "shawarma"], ["snack", "biscuit", "cookie", "crisps", "chevda"], ["sweet", "candy", "chocolate", "lollipop", "pipi"],
  // health and beauty
  ["pharmacy", "drugstore", "dawa", "medicine", "drug", "medication"], ["hospital", "doctor", "dispensary", "medical", "health", "daktari"], ["dentist", "dental", "teeth", "tooth", "meno"],
  ["optical", "eyetest", "eyecare"], ["painkiller", "panadol", "paracetamol", "ibuprofen", "brufen"], ["vitamin", "supplement", "multivitamin"], ["sanitizer", "sanitiser", "handwash"],
  ["tampon", "sanitary", "kotex"], ["diaper", "nappy", "pampers", "huggies"], ["condom", "contraceptive", "family planning"],
  ["haircut", "barber", "kinyozi", "kiboko", "fade", "hairdresser"], ["shave", "kinyozi", "barber", "razor"], ["trim", "beard"], ["salon", "hairdresser", "beautician", "stylist", "hairstyle", "kinyozi"], ["braid", "braids", "plait", "cornrow", "twist", "kusuka", "rasta"],
  ["dreadlock", "dreadlocks", "locs", "retwist"], ["wig", "weave", "extension", "hairpiece", "closure", "frontal"], ["nail", "nails", "manicure", "pedicure", "acrylic"],
  ["makeup", "cosmetic", "cosmetics", "foundation", "lipstick", "mascara", "eyeshadow", "concealer"], ["lash", "lashes", "eyelash", "eyebrow", "brow", "microblading"], ["massage", "spa", "sauna", "facial"],
  ["waxing", "threading"], ["lotion", "moisturiser", "moisturizer", "vaseline"], ["soap", "sabuni", "bathing", "bodywash"], ["shampoo", "conditioner", "relaxer"],
  ["perfume", "fragrance", "cologne", "parfum", "scent", "deodorant", "deo", "oud"], ["gym", "fitness", "workout", "training", "crossfit", "aerobics", "zumba"], ["dumbbell", "weights", "barbell", "kettlebell"],
  // services and events
  ["photographer", "photography", "photoshoot", "photos", "photo", "videographer", "videography", "video", "drone", "shoot"], ["wedding", "bridal", "bride", "groom", "harusi", "reception", "dowry"],
  ["caterer", "catering", "buffet"], ["tent", "canopy", "marquee"], ["decor", "decoration", "decorator", "balloon", "balloons", "florist", "flower", "bouquet"], ["dj", "mc", "emcee", "disco"],
  ["hall", "venue", "ukumbi", "grounds"], ["chairs", "tables", "furniture", "rental", "kodi"], ["lodging", "lodge", "accommodation", "guesthouse", "bnb", "airbnb", "motel", "resort"],
  ["house", "apartment", "flat", "bedsitter", "bedsit", "studio", "maisonette", "bungalow", "nyumba", "plot", "property"],
  ["lawyer", "advocate", "legal", "attorney", "notary", "wakili"], ["accountant", "accounting", "bookkeeping", "audit", "kra", "payroll"], ["tutor", "tuition", "teacher", "lesson", "coaching", "mwalimu", "revision"],
  ["daycare", "nursery", "creche", "childcare", "kindergarten", "babysitter", "nanny", "playgroup"], ["school", "academy", "college", "institute", "shule"], ["cleaner", "cleaning", "housekeeping", "househelp", "maid", "janitor", "fumigation", "pest"],
  ["laundry", "dryclean", "drycleaning", "washing", "mamafua", "ironing"], ["funeral", "burial", "casket", "coffin", "mortuary", "undertaker", "cremation", "wreath"], ["gift", "hamper", "zawadi", "souvenir"],
  ["vet", "veterinary", "animal", "livestock", "mifugo"], ["dog", "puppy", "pet", "cat", "kitten", "leash"], ["fodder", "pellets", "mash", "layers", "growers"], ["chick", "chicks", "chicken", "brooder", "incubator"],
  ["fertilizer", "fertiliser", "manure", "dap", "urea", "mbolea"], ["seed", "seeds", "mbegu", "seedling", "seedlings", "nursery"], ["pesticide", "insecticide", "herbicide", "fungicide", "dawa"],
  ["book", "books", "novel", "textbook", "stationery", "kitabu", "notebook"], ["pen", "biro"], ["marker", "highlighter"], ["toy", "toys", "doll", "puzzle", "lego"],
  ["baby", "infant", "newborn", "toddler", "mtoto", "pram", "stroller", "pushchair", "cot", "crib"], ["wifi", "cyber", "cybercafe", "browsing", "typing", "online"], ["bet", "betting", "sportpesa"]
];

const SYMMETRIC = (() => {
  const out = {};
  for (const set of SETS) {
    for (const word of set) {
      const key = word.toLowerCase();
      if (!/^[a-z0-9]+$/.test(key)) continue;
      const mates = set.map((w) => w.toLowerCase()).filter((w) => w !== key && /^[a-z0-9]+$/.test(w));
      out[key] = [...new Set([...(out[key] ?? []), ...mates])];
    }
  }
  return out;
})();

// The hand-written one-way entries stay as they were; the symmetrical sets add to them.
export const LOCAL_SYNONYMS = (() => {
  const merged = { ...SYMMETRIC };
  for (const [word, more] of Object.entries(DIRECTIONAL)) merged[word] = [...new Set([...(merged[word] ?? []), ...more])];
  return merged;
})();

