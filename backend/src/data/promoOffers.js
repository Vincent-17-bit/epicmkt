const DAY = 86400000;

const offer = (id, businessId, title, kind, extra = {}) => {
  const at = Date.now();
  const { startsInDays = -1, endsInDays = 14, ...rest } = extra;
  return {
    id,
    businessId,
    title,
    description: null,
    kind,
    value: null,
    valueText: null,
    appliesTo: "store",
    itemIds: [],
    sectionId: null,
    code: null,
    terms: null,
    conditions: {},
    thumbnail: null,
    startsAt: startsInDays === null ? null : new Date(at + startsInDays * DAY).toISOString(),
    endsAt: endsInDays === null ? null : new Date(at + endsInDays * DAY).toISOString(),
    status: "active",
    createdAt: new Date(at - 7 * DAY).toISOString(),
    updatedAt: new Date(at - 7 * DAY).toISOString(),
    ...rest
  };
};

export const seedOffers = () => [
  offer("p_001", "b_001", "Student week", "percent_off", { value: 10, description: "10% off any cut with a student ID.", code: "STUDENT10", endsInDays: 5, conditions: { minSpend: 100 }, terms: "Show a valid student ID at the chair." }),
  offer("p_002", "b_001", "Bring a friend", "multi_buy", { valueText: "2 for 250", appliesTo: "items", itemIds: ["haircut", "kids-cut"], description: "Adult cut and kids cut together.", endsInDays: 21 }),
  offer("p_003", "b_017", "Braids refresh", "amount_off", { value: 300, valueText: "KES 300 off", appliesTo: "section", sectionId: "braids", description: "Off any braiding service.", endsInDays: 10 }),
  offer("p_004", "b_013", "First week free", "free_service", { valueText: "7 days free", description: "Try the gym free as a new member.", conditions: { newCustomersOnly: true }, endsInDays: null }),
  offer("p_005", "b_007", "Free BP check", "free_service", { valueText: "Free check", appliesTo: "items", itemIds: ["multivitamin-30-tablets", "digital-thermometer"], description: "With either of these items.", endsInDays: 18 }),
  offer("p_006", "b_010", "Seed season", "percent_off", { value: 10, appliesTo: "section", sectionId: "seed", description: "On two or more bags.", endsInDays: 25 }),
  offer("p_007", "b_020", "Free gasket", "freebie", { valueText: "Free gasket", appliesTo: "items", itemIds: ["pressure-cooker-5l"], description: "Spare gasket with every pressure cooker.", endsInDays: 12 }),
  offer("p_008", "b_003", "Weekday special", "custom", { valueText: "Early bird", description: "Quieter chairs before 10am.", conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"] }, endsInDays: 30 }),
  offer("p_009", "b_002", "Paused deal", "percent_off", { value: 5, status: "paused", endsInDays: 30 }),
  offer("p_010", "b_001", "Coming soon", "percent_off", { value: 15, startsInDays: 6, endsInDays: 20, status: "scheduled", appliesTo: "items", itemIds: ["hair-dye"] })
];
