// Catalogue coverage, part 4: more types for the categories that had the fewest (professional services, rentals, hotels, transport).
// Shipped in its own migration (0133) so a database that already ran 0132 gets them too.
import { ax, b, c, rec, req, t, type } from "./lib.mjs";

export const COVERAGE_MORE = [
  // ---- Professional services ----------------------------------------------------------------------------------------------
  type("legal-service", "Legal services", {
    dept: "photography-events", cats: ["professional-services"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Consultation", "Contract drafting", "Conveyancing", "Succession and wills", "Company registration", "Court representation", "Demand letter", "Debt recovery", "Immigration"] }), ax("mode", "Mode", { values: ["Office visit", "Online", "Phone"] })],
    rows: [req(t("registration", "Advocate number (LSK)")), req(c("billing", "Fee is", ["Fixed", "Per hour", "Percentage", "On quote"])), rec(b("free-first", "Free first consultation")), rec(t("languages", "Languages")), rec(t("turnaround", "Typical turnaround"))],
    x: { priceRule: "per-job" }
  }),
  type("accounting-tax-service", "Accounting, tax and payroll", {
    dept: "photography-events", cats: ["professional-services"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Bookkeeping", "KRA returns", "Audit", "Payroll", "VAT and PAYE", "Business plan", "Financial statements", "Tax clearance", "Company annual returns"] }), ax("size", "Business size", { values: ["Individual", "Small shop", "SME", "Company"] })],
    rows: [req(t("registration", "ICPAK or practising number")), req(c("billing", "Fee is", ["Monthly", "Per return", "Per hour", "On quote"])), rec(b("software", "Uses accounting software")), rec(b("remote", "Works online"))],
    x: { priceRule: "per-job" }
  }),
  type("architecture-survey-service", "Architecture, survey and engineering", {
    dept: "photography-events", cats: ["professional-services", "welding-fabrication"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["House plans", "NCA approval drawings", "Bill of quantities", "Site supervision", "Land survey", "Valuation", "Structural design", "Interior design", "Project management"] }), ax("project", "Project", { values: ["House", "Apartments", "Commercial", "Farm", "Industrial"] })],
    rows: [req(t("registration", "Registration (BORAQS, EBK, ISK)")), req(c("billing", "Fee is", ["Fixed", "Percentage of project", "Per hour", "On quote"])), rec(b("site-visit", "Free site visit")), rec(t("turnaround", "Typical turnaround"))],
    x: { priceRule: "per-job" }
  }),
  type("creative-digital-service", "Design, marketing and software", {
    dept: "photography-events", cats: ["professional-services", "event-hire"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Logo and branding", "Social media management", "Website", "Mobile app", "Video editing", "Photography", "Copywriting", "Translation", "IT support"] }), ax("size", "Package", { values: ["Starter", "Standard", "Premium"] })],
    rows: [req(t("deliverables", "What you get")), req(t("turnaround", "Delivery time")), rec(t("revisions", "Revisions included")), rec(t("portfolio", "Portfolio link")), rec(b("remote", "Works online"))],
    x: {}
  }),
  // ---- Rentals ------------------------------------------------------------------------------------------------------------
  type("commercial-space-rental", "Shop, office and warehouse to let", {
    dept: "photography-events", cats: ["rentals-real-estate"], kind: "package",
    axes: [ax("space", "Space", { values: ["Shop", "Stall", "Office", "Co-working desk", "Warehouse", "Showroom", "Salon space", "Restaurant space"] }), ax("size", "Size", { values: ["Up to 20 sq m", "20 to 50 sq m", "50 to 100 sq m", "100 to 500 sq m", "Above 500 sq m"] })],
    rows: [req(c("price-per", "Rent is per", ["Month", "Week", "Day", "Year"])), req(t("location", "Building and town")), req(t("deposit", "Deposit required")), rec(t("floor", "Floor")), rec(b("parking", "Parking")), rec(t("utilities", "Service charge, water, power"))],
    x: {}
  }),
  type("property-management-service", "Property management and agent services", {
    dept: "photography-events", cats: ["rentals-real-estate"], kind: "service",
    axes: [ax("service", "Service", { display: "text-card", values: ["Rent collection", "Tenant search", "Property management", "Valuation", "Site visits", "Lease drafting", "Caretaking"] }), ax("property", "Property", { values: ["Residential", "Commercial", "Land"] })],
    rows: [req(c("fee", "Fee is", ["Percentage of rent", "Fixed per month", "Per service"])), rec(t("registration", "Estate Agents Registration Board number")), rec(t("area", "Areas covered"))],
    x: {}
  }),
  // ---- Hotels -------------------------------------------------------------------------------------------------------------
  type("hotel-day-use-package", "Day use, pool and spa day packages", {
    dept: "photography-events", cats: ["hotels-lodging"], kind: "package",
    axes: [ax("package", "Package", { values: ["Day room", "Pool day pass", "Spa day", "Lunch and pool", "Weekend getaway", "Team building day", "Honeymoon", "Conference day"] }), ax("guests", "Guests", { values: ["1", "2", "4", "10", "20 and above"] })],
    rows: [req(t("includes", "What is included")), req(t("hours", "Hours")), rec(b("booking", "Advance booking needed")), rec(t("cancellation", "Cancellation terms"))],
    x: {}
  }),
  type("hostel-bed", "Hostel and student accommodation", {
    dept: "photography-events", cats: ["hotels-lodging", "rentals-real-estate"], kind: "package",
    axes: [ax("room", "Room", { values: ["Bed in dorm", "Single room", "Double room", "Shared 2 bedroom", "Self-contained"] }), ax("period", "Period", { values: ["Night", "Week", "Month", "Semester"] })],
    rows: [req(t("location", "Campus or area")), req(c("for", "For", ["Women", "Men", "Mixed", "Students only"])), rec(b("meals", "Meals included")), rec(b("wifi", "Wi-Fi")), rec(t("deposit", "Deposit"))],
    x: {}
  }),
  // ---- Transport ----------------------------------------------------------------------------------------------------------
  type("school-staff-transport", "School and staff transport", {
    dept: "auto-parts", cats: ["transport-logistics"], kind: "service",
    axes: [ax("service", "Service", { values: ["School bus", "Staff shuttle", "Church trip", "Tour and excursion", "Wedding transport", "Funeral transport", "Airport pickup"] }), ax("seats", "Seats", { values: ["Up to 7", "14", "25", "33", "50 and above"] })],
    rows: [req(c("price", "Price is", ["Per term", "Per month", "Per trip", "Per day"])), req(t("routes", "Routes or area")), rec(b("insured", "Insured and licensed")), rec(b("seat-belts", "Seat belts and speed governor"))],
    x: {}
  }),
  type("freight-haulage", "Freight and haulage", {
    dept: "auto-parts", cats: ["transport-logistics"], kind: "service",
    axes: [ax("service", "Service", { values: ["Full load", "Part load", "Container", "Refrigerated", "Construction materials", "Farm produce", "Cross-border"] }), ax("vehicle", "Vehicle", { values: ["Pickup", "3 tonne", "7 tonne", "10 tonne", "Trailer"] })],
    rows: [req(t("routes", "Routes")), req(c("price", "Price is", ["Per trip", "Per tonne", "Per km"])), rec(b("tracking", "GPS tracking")), rec(b("insurance", "Goods in transit insured")), rec(b("loading", "Loading help"))],
    x: {}
  })
];
