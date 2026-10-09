export const business = {
  id: "b1",
  slug: "fade-kings",
  name: "Fade Kings",
  tagline: "Sharp cuts",
  description: "A barbershop.",
  plan: "premium",
  verified: true,
  isOpen: true,
  rating: 4.5,
  reviewCount: 3,
  phone: "0712345678",
  whatsapp: "0712345678",
  lat: -0.09,
  lng: 34.6,
  address: "Main St",
  area: "Maseno",
  county: "Kisumu",
  categoryName: "Barbershops",
  promo: { flash: 1, offers: 0 },
  tags: ["fade"],
  category: { singular: "Barbershop" },
  offers: [{ id: "o1", title: "Student", description: "10% off", expiresAt: "2099-01-01", code: "ST" }],
  gallery: [{ id: "g1", url: "/g.jpg", caption: "Front" }],
  services: [{ id: "s1", name: "Fade", priceKes: 300, section: "Cuts" }]
};

export const item = {
  id: "i1",
  name: "Fade",
  imageUrl: "/fade.jpg",
  availability: "limited",
  pricing: { salePrice: 270, regularPrice: 300, savings: 30, discountPercent: 10 }
};

export const pageProps = {
  business,
  icon: { prefix: "fas", iconName: "store", icon: [1, 1, [], "f000", "M0 0"] },
  statusText: "Open now",
  reviewsText: "4.5 (3)",
  distanceKm: null,
  locate: { label: "Show distance from me", onClick: () => {} },
  hoursRows: [{ day: "mon", name: "Monday", today: true, text: "8:00 AM to 5:00 PM" }],
  formatExpiry: () => "Ends soon",
  socials: [{ key: "instagram", href: "https://instagram.com/x", label: "Instagram", icon: { prefix: "fas", iconName: "x", icon: [1, 1, [], "f000", "M0 0"] } }],
  shortUrl: "https://epicmkt.co.ke/s/abc",
  breadcrumbs: null
};
