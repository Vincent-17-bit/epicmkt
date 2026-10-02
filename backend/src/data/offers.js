const DAY = 86400000;

const offer = (id, title, description, days, code = null) => ({
  id,
  title,
  description,
  code,
  expiresAt: new Date(Date.now() + days * DAY).toISOString()
});

export const offersById = {
  b_001: [
    offer("o1", "Student discount", "20% off any cut with a valid student ID.", 21),
    offer("o2", "Fade and beard combo", "Pay KSh 250 instead of KSh 300 on weekdays before 5pm.", 9, "FADE250")
  ],
  b_002: [offer("o1", "Early bird cut", "KSh 100 haircuts before 9am.", 14)],
  b_004: [offer("o1", "Refill bundle", "Buy 10 refills of 20L and get the 11th free.", 30)],
  b_005: [offer("o1", "Free delivery", "Free delivery on orders of five 20L containers or more.", 12, "FREEDEL")],
  b_007: [offer("o1", "Free BP check", "Free blood pressure check with any purchase over KSh 500.", 18)],
  b_010: [offer("o1", "Seed season deal", "10% off certified seed when you buy two or more bags.", 25)],
  b_013: [
    offer("o1", "First week free", "Try the gym free for seven days as a new member.", 15),
    offer("o2", "Bring a friend", "Day pass for two at KSh 600.", 6, "TWO600")
  ],
  b_017: [offer("o1", "Braids and wig bundle", "KSh 500 off when you book braids with a wig install.", 20)],
  b_018: [offer("o1", "Free diagnostics", "Free diagnostics with any basic service.", 10)],
  b_022: [offer("o1", "Biryani Friday", "Two chicken biryani plates for KSh 1,000 every Friday.", 28)],
  b_021: [offer("o1", "Lunch special", "Chapati and beans with tea for KSh 150, 12pm to 2pm.", -3)]
};
