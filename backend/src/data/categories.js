const flag = (key, label) => ({ key, label, type: "boolean", filterable: true });

const choice = (key, label, options) => ({
  key,
  label,
  type: "select",
  filterable: true,
  options: options.map(([value, text]) => ({ value, label: text }))
});

export const categories = [
  { id: "barbershops", name: "Barbershops", singular: "Barbershop", icon: "scissors", hue: 210, blurb: "Cuts, fades and shaves", fields: [choice("booking", "Booking", [["walk-in", "Walk-in only"], ["appointment", "By appointment"], ["both", "Walk-in or appointment"]]), flag("kids-cuts", "Kids' cuts"), flag("beard-grooming", "Beard grooming")] },
  { id: "water-refill", name: "Water Refill Points", singular: "Water refill point", icon: "droplet", hue: 195, blurb: "Clean drinking water on tap", fields: [choice("water-type", "Water type", [["purified", "Purified"], ["borehole", "Borehole"], ["spring", "Spring"]]), flag("delivery", "Delivery"), flag("jerrycans", "Sells jerrycans")] },
  { id: "chemists", name: "Chemists", singular: "Chemist", icon: "pills", hue: 150, blurb: "Pharmacies and health shops", fields: [flag("prescriptions", "Fills prescriptions"), flag("clinic", "On-site clinic"), flag("delivery", "Delivery")] },
  { id: "agrovets", name: "Agrovets", singular: "Agrovet", icon: "seedling", hue: 110, blurb: "Seeds, feeds and farm inputs", fields: [flag("animal-feeds", "Animal feeds"), flag("vet-services", "Vet services"), flag("delivery", "Delivery")] },
  { id: "gyms", name: "Gyms", singular: "Gym", icon: "dumbbell", hue: 20, blurb: "Small gyms and fitness studios", fields: [choice("audience", "Open to", [["mixed", "Everyone"], ["women", "Women only"], ["men", "Men only"]]), flag("showers", "Showers"), flag("trainers", "Personal trainers")] },
  { id: "salons", name: "Salons", singular: "Salon", icon: "spa", hue: 320, blurb: "Hair, braids and beauty", fields: [choice("clientele", "Open to", [["women", "Women"], ["men", "Men"], ["everyone", "Everyone"]]), flag("braiding", "Braiding"), flag("nails", "Nails")] },
  { id: "mechanics", name: "Mechanics", singular: "Garage", icon: "wrench", hue: 240, blurb: "Garages and vehicle repair", fields: [choice("vehicles", "Vehicles", [["cars", "Cars and pickups"], ["motorbikes", "Motorbikes"], ["all", "All vehicles"]]), flag("welding", "Welding"), flag("towing", "Towing")] },
  { id: "hardware", name: "Hardware", singular: "Hardware shop", icon: "hammer", hue: 35, blurb: "Building and repair supplies", fields: [flag("delivery", "Delivery"), flag("cement", "Cement"), flag("tool-hire", "Tool hire")] },
  { id: "eateries", name: "Eateries", singular: "Eatery", icon: "utensils", hue: 5, blurb: "Local kitchens and cafés", fields: [choice("cuisine", "Cuisine", [["kenyan", "Kenyan"], ["swahili", "Swahili"], ["fast-food", "Fast food"]]), flag("delivery", "Delivery"), flag("takeaway", "Takeaway")] },
  { id: "phone-repair", name: "Phone Repair", singular: "Phone repair", icon: "mobile-screen", hue: 270, blurb: "Screens, batteries and unlocks", fields: [choice("devices", "Devices", [["phones", "Phones"], ["phones-laptops", "Phones and laptops"]]), flag("same-day", "Same-day repair"), flag("warranty", "Repair warranty")] }
];
