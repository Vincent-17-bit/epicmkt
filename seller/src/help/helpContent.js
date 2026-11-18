export const FAQ = [
  { q: "How do I add an item and photos?", a: "Open My listings and tap Add item. First pick what you are adding (search a type such as bread, phone or haircut, or choose Other goods). The editor then opens in this order: Media (add a clear photo), Basics (the name), Options (only if buyers choose a size, colour, brand or weight), Price and stock, Details, and Review. Save as draft at any time; Add item publishes it. Clear, well-lit photos get more taps." },
  { q: "One item comes in different brands, weights or sizes. How do I give each its own price?", a: "Use the Options step. Example: white bread sold as Festive and Supa Loaf in 400 g, 700 g and 900 g. Add the option Brand (Festive, Supa Loaf) and the option Weight (400 g, 700 g, 900 g); a table appears with one row per combination, where you type each price (Festive 400 g KES 65, Supa Loaf 400 g KES 60...) and, if you count stock, how many you have. Each choice can also have its own photo." },
  { q: "What do Section, Highlights, Specifications and “Starting from” mean?", a: "Section groups items on your shop page, like Bread, Cakes or Haircuts. Highlights are short selling points shown under “About this item”, like 【Freshness guaranteed】: Baked every morning. Specifications are facts buyers check, like Weight: 400 g or Material: cotton. Price type “Starting from” shows “From KES 60”: use it when the final price depends on the option or quantity the buyer picks." },
  { q: "What is a photo spin or a 3D model, and do I need one?", a: "Both are optional. A photo spin is 12 to 72 photos taken all the way round the item; buyers drag across it and the item turns. A 3D model is a .glb file made in a 3D app. They help for shoes, bags, phones and furniture. Food, services and most everyday items do not need them: good photos are enough. Save the item first, then open Media, then 3D model and photo spin." },
  { q: "Can one item have its own delivery?", a: "Yes. In the editor, open Price and stock, then Delivery for this item. Same as my shop uses your Settings; Set delivery for this item gives it its own fee (0 for free), area and delivery time, and can say buyers may also pick it up; Pickup only is for items you do not deliver, like a heavy sofa. Buyers see it next to the price." },
  { q: "What are Notes buyers must see, Images and From the brand?", a: "All are optional. Notes buyers must see (Details) are up to 3 boxes under About this item, for things like Product voltage: 240 V or Keep refrigerated. Images (Media) are up to 5 big pictures shown above the videos, like a short picture tour; use landscape pictures of about 1600 x 900 px. From the brand (Details) shows awards and numbers the brand is proud of as cards on a wide banner. None of these pictures uses a photo slot of your plan." },
  { q: "How do I list What is included with pictures?", a: "In Details, What is included, add one line per thing: a short name (shown in bold), optional details after it, and an optional picture. A picture always needs a name. Lines with a picture show as cards; the rest show as a list. Buyers see this section first under the item." },
  { q: "How do I close for a short while?", a: "Open Exceptions under More, pick the date, say whether you are closed or open different hours, and add a short note. Customers see it on your listing, and it ends on its own." },
  { q: "What does confirming prices mean?", a: "Every so often we ask you to check that your prices are still right. Confirming takes one tap in My listings and keeps customers from seeing old prices. You choose how often in Settings." },
  { q: "Who are the questions from EpicMKT?", a: "Sometimes the team needs to check something about your listing. You will see them under Questions and as a notice in Notifications. Replying quickly keeps your listing in good standing." },
  { q: "How do I pay or renew?", a: "Open Subscription and follow the steps to pay by M-Pesa. We confirm your payment by message, and your paid-until date moves forward." },
  { q: "Why can I not change my phone number or category directly?", a: "These are checked to keep listings trustworthy. Send a phone change request from Settings, or a category change from Subscription, and we will confirm it." },
  { q: "How do I get my QR poster?", a: "Open QR poster under More. Print it so customers can scan it to open your listing." }
];

export const GUIDES = [
  { id: "items", title: "Add items and photos", steps: [
    "Open My listings and tap Add item.",
    "Pick what you are adding: search a type such as bread, phone or haircut, or choose Add as Other goods.",
    "Media: add a bright, close photo with a plain background. More photos and a video are optional.",
    "Basics: write a clear name, like White bread loaf 400 g. Section groups items on your page, like Bread or Cakes.",
    "Options (only if buyers choose): add Size, Colour, Brand or Weight and type the price of each combination.",
    "Price and stock: choose the price type and type the price. “Starting from” shows “From KES 60”.",
    "Details: add highlights, specifications and what is included, then tap Add item. Save as draft if you want to finish later."
  ] },
  { id: "closing", title: "Close for a day or change your hours", steps: ["Open Exceptions under More.", "Pick the date.", "Choose closed, or open different hours, and add a short note.", "Save. Customers see it on your listing."] },
  { id: "prices", title: "Confirm your prices", steps: ["Open My listings and look for items marked as having an old price.", "Update any price that changed.", "Choose Confirm prices to mark the rest as checked."] },
  { id: "questions", title: "Answer a question from the team", steps: ["Open Questions.", "Read the question carefully.", "Type a short, honest reply and send it.", "We will tell you if anything else is needed."] },
  { id: "pay", title: "Pay for your listing", steps: ["Open Subscription.", "Follow the M-Pesa steps shown.", "Keep the confirmation message until we confirm your payment."] },
  { id: "qr", title: "Print your QR poster", steps: ["Open QR poster under More.", "Download it and print it on A4.", "Place it at the counter or the door."] }
];
