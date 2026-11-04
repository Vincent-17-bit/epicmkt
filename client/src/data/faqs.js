import { routes } from "../config/routes.js";

// The one source for every question and answer shown on /faq, /help and /pricing.
// Each item: { id, q, a (plain text, also used for the FAQPage JSON-LD), link?: { to, label } }
// Keep answers in step with the About page, the Seller guide and the Terms: no new policies here.

const shoppers = [
  {
    id: "buy",
    q: "How do I buy from a business?",
    a: "Contact the business using the Call, WhatsApp or Directions buttons on its listing. You agree the order, price and payment directly with them."
  },
  {
    id: "contact",
    q: "How do I contact a business?",
    a: "Each listing has Call, WhatsApp and Directions buttons. Tap one to phone the business, message it on WhatsApp or open the route in your maps app."
  },
  {
    id: "featured",
    q: "What does Featured mean?",
    a: "Featured businesses are on the Premium plan. They carry a Featured badge and are shown first in results."
  },
  {
    id: "verified",
    q: "What does Verified mean?",
    a: "A Verified badge shows a business whose details have been checked by EpicMKT."
  },
  {
    id: "closed",
    q: "Why does a business show as Closed?",
    a: "Open or Closed is based on the opening hours the business has set, in East Africa Time. Hours can change, so call ahead if you are unsure."
  },
  {
    id: "free",
    q: "Is EpicMKT free to use?",
    a: "Yes. Searching and contacting businesses costs you nothing."
  }
];

const businesses = [
  {
    id: "listed",
    q: "How can my business be listed?",
    a: "Choose Become a seller in the menu. Businesses pay a monthly fee for a Standard or Premium listing.",
    link: { to: routes.sellerGuide, label: "Read the seller guide" }
  },
  {
    id: "documents",
    q: "What do I need to apply?",
    a: "Your National ID, Maisha Card or passport, your Single Business Permit and a photo of your signboard or shop front. If your business is registered, also your KRA PIN and registration certificate. Some types of business are asked for one more document.",
    link: { to: routes.sellerGuide, label: "See the full list" }
  },
  {
    id: "apply-time",
    q: "How long does applying take?",
    a: "About 5 minutes. Your draft is saved on this device, so you can leave and pick it up later.",
    link: { to: routes.apply, label: "Start your application" }
  }
];

const pricing = [
  {
    id: "no-commission",
    q: "Does EpicMKT take a cut of my sales?",
    a: "No. You pay a flat monthly fee for your plan and every sale stays with you."
  },
  {
    id: "price-by-type",
    q: "Why does the price depend on my type of business?",
    a: "Each type of business has its own monthly price. The prices above start at the lowest, and your exact price is shown before you send your application. For the full list, ask for the plans PDF."
  },
  {
    id: "when-pay",
    q: "When do I pay?",
    a: "Applying is free. You pay only after we approve your application, and your listing goes live once your first payment is confirmed."
  },
  {
    id: "how-pay",
    q: "How do I pay?",
    a: "By M-Pesa Paybill. Use the reference in your approval message as the account number. Once you are live, use your Seller ID to renew."
  },
  {
    id: "months-ahead",
    q: "Can I pay for more than one month?",
    a: "Yes. You can pay several months ahead, and any amount left over is kept as credit towards your next payment."
  },
  {
    id: "late",
    q: "What if I pay late?",
    a: "There is a short grace period after your paid date. If you have not renewed by then, your listing may be taken down until you pay."
  },
  {
    id: "change-plan",
    q: "Can I change my plan later?",
    a: "Yes. You can upgrade from Standard to Premium from the Subscription page in your seller dashboard."
  },
  {
    id: "plans-pdf",
    q: "How do I get the plans PDF?",
    a: "Contact EpicMKT support and we will send it to you. It lists the plans and prices for every type of business."
  }
];

const safety = [
  {
    id: "report",
    q: "How do I report a problem with a listing?",
    a: "Open the listing and choose Report a problem. Pick a reason, add details if you like, and send it.",
    link: { to: routes.reportProblem, label: "More about reporting" }
  },
  {
    id: "after-report",
    q: "What happens after I report something?",
    a: "We review reports in good faith. We may correct, suspend or remove a listing, but we are not obliged to act on every report.",
    link: { to: routes.terms, label: "Read the Terms of Service" }
  },
  {
    id: "payments",
    q: "Does EpicMKT take orders or handle payments?",
    a: "No. You agree the order, price and payment directly with the business. EpicMKT does not take orders or handle payments between businesses and customers."
  },
  {
    id: "asked-for-money",
    q: "What if someone asks me to pay on behalf of EpicMKT?",
    a: "EpicMKT will never ask you for money on behalf of a business. If someone claiming to represent EpicMKT asks you to pay for a purchase, do not pay and report it to us.",
    link: { to: routes.contact, label: "Contact EpicMKT" }
  }
];

export const faqGroups = [
  { id: "shoppers", title: "For shoppers", items: shoppers },
  { id: "businesses", title: "For businesses", items: businesses },
  { id: "pricing", title: "Pricing and payment", items: pricing },
  { id: "safety", title: "Safety and reports", items: safety }
];

export const pricingFaqs = pricing;

export const allFaqs = faqGroups.flatMap((g) => g.items);

export const faqById = Object.fromEntries(allFaqs.map((f) => [f.id, f]));

// The short list on the Help centre, in this order.
export const POPULAR_FAQ_IDS = ["buy", "contact", "free", "listed"];
export const popularFaqs = POPULAR_FAQ_IDS.map((id) => faqById[id]);
