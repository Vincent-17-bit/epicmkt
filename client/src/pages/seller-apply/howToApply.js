import { faClipboardCheck, faFileSignature, faMoneyBillTransfer, faStore } from "@fortawesome/free-solid-svg-icons";
import { STEPS } from "./formModel.js";

// How becoming a seller works, written once. The application page (Intro.jsx) shows the short lines; /sell shows the longer ones and
// builds its "What do I need" answer from HAVE_READY. Change a step here and both pages follow.

// What each step of the form asks about, in a sentence. A step added to the form without a phrase here still shows (its short name).
const PHRASE = { business: "your business", you: "you", place: "your location", papers: "your documents", send: "your plan" };
const formSteps = STEPS.map((s) => PHRASE[s.id] ?? s.short.toLowerCase());
const NUMBER = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = NUMBER[STEPS.length] ?? String(STEPS.length);
const listed = (words) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

export const APPLY_STEPS = Object.freeze([
  {
    icon: faFileSignature,
    title: "Apply",
    text: `${count.charAt(0).toUpperCase()}${count.slice(1)} short steps, about 5 minutes.`,
    detail: `Fill in ${count} short steps: ${listed(formSteps)}. It takes about 5 minutes and is saved as you go.`
  },
  {
    icon: faClipboardCheck,
    title: "Review",
    text: "We check your details and may ask for fixes.",
    detail: "We check your details and documents. If something needs fixing we tell you what, and you fix it from your status page."
  },
  {
    icon: faMoneyBillTransfer,
    title: "Pay",
    text: "After approval, pay the monthly fee by M-Pesa.",
    detail: "Once you are approved, pay your plan's monthly fee by M-Pesa. Nothing is charged before approval."
  },
  {
    icon: faStore,
    title: "Go live",
    text: "We send your login and your listing goes live.",
    detail: "We send your Seller ID and a temporary password by SMS and email, and your page, short link and QR code go live for customers."
  }
]);

export const HAVE_READY = Object.freeze([
  "Your National ID, Maisha Card or passport",
  "Your Single Business Permit",
  "A photo of your signboard or shop front",
  "Your KRA PIN and registration certificate, if registered"
]);

/** "What do I need to get listed?" in one sentence, from the same list the application page shows. */
export const haveReadyText = () => {
  // Semicolons between the things: some of them have commas of their own ("ID, Maisha Card or passport").
  const items = HAVE_READY.map((s) => s.charAt(0).toLowerCase() + s.slice(1));
  return `Have these ready: ${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}. The form also asks for your business name and category, your phone number and where customers find you.`;
};
