const FIRST = {
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

const MORE = {
  mtungi: ["gas", "cylinder", "lpg"], lpg: ["gas", "cylinder"], cylinder: ["gas", "lpg"], refill: ["gas", "refilling"], refil: ["refill"],
  machungwa: ["orange"], tangawizi: ["ginger"], ndengu: ["green", "gram"], kamande: ["lentil"], omena: ["fish", "sardine"], kienyeji: ["indigenous", "free"],
  dawa: ["medicine", "drug", "pharmacy"], homa: ["fever", "flu", "pain"], miwani: ["glasses", "spectacles"], kioo: ["screen", "glass", "mirror"],
  chaja: ["charger", "charging"], earfones: ["earphone", "earbud"], kuosha: ["wash", "cleaning"], mekanika: ["mechanic", "garage", "repair"], simiti: ["cement"],
  stima: ["electricity", "electrical", "electrician"], mbao: ["timber", "wood"], mbwa: ["dog", "puppy"], mbegu: ["seed", "seeds"], mahindi: ["maize", "corn"],
  kunyoa: ["shave", "haircut", "barber"], broken: ["repair", "fix", "replacement"], cracked: ["repair", "fix", "replacement"], smashed: ["repair", "replacement"], damaged: ["repair", "replacement"], fix: ["repair", "replacement"], repair: ["fix", "replacement"],
  photocopy: ["printing", "cyber"], ecitizen: ["cyber", "printing"], kra: ["cyber", "tax"], mpesa: ["agent"], tutor: ["tuition", "teacher"], tuition: ["tutor", "teacher"],
  bedsitter: ["studio", "bedsit"]
};

const merge = (a, b) => {
  const out = { ...a };
  for (const [word, more] of Object.entries(b)) out[word] = [...new Set([...(out[word] ?? []), ...more])];
  return out;
};

export const LOCAL_SYNONYMS = merge(FIRST, MORE);
