// What search results should say about each fixed page. Store, item and category pages write their own from the data.
export const PAGE_DESCRIPTIONS = {
  "/flash": "Flash sales from local businesses in Kenya. See the deals running right now and how long each one lasts.",
  "/offers": "Deals and discounts from local businesses near you in Kenya.",
  "/featured": "Featured local businesses in Kenya: barbershops, chemists, gyms, agrovets and more.",
  "/about": "EpicMKT is a directory of local businesses in Kenya. Find what you need nearby, then call, WhatsApp or get directions in one tap.",
  "/contact": "Questions about a listing, feedback, or want your business listed? Contact the EpicMKT team.",
  "/faq": "Answers to common questions about finding businesses on EpicMKT and listing your own.",
  "/sell": "List your business on EpicMKT and get found by customers nearby in Kenya. No commission. Compare plans and start today.",
  "/pricing": "Simple monthly pricing for listing your business on EpicMKT in Kenya. Compare Standard and Premium, see the price for your type of business and ask for the plans PDF.",
  "/seller-guide": "How to list your business on EpicMKT: what to prepare, how to apply, how payment works and how to build your page.",
  "/privacy": "How EpicMKT handles your personal data and your rights under the Kenya Data Protection Act, 2019.",
  "/terms": "The terms for using EpicMKT, including what EpicMKT does and does not do.",
  "/cookies": "How EpicMKT uses cookies and storage on your device, and how you can control them."
};

// Pages that should not appear in search results: results of a search, private or transient screens, redirects.
export const NOINDEX_PATTERNS = [/^\/search$/, /^\/offline$/, /^\/s\/.+/, /^\/sell\/register$/, /^\/become-a-seller\/status$/];

export const isNoindexPath = (pathname) => NOINDEX_PATTERNS.some((re) => re.test(pathname));
