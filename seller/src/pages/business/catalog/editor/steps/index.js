import { PRICED, filled, parseKes } from "../fields.js";
import { errorList } from "../model.js";
import MediaStep from "./MediaStep.jsx";
import BasicsStep from "./BasicsStep.jsx";
import TypeStep from "./TypeStep.jsx";
import OptionsStep from "./OptionsStep.jsx";
import PriceStep from "./PriceStep.jsx";
import DetailsStep from "./DetailsStep.jsx";
import ReviewStep from "./ReviewStep.jsx";

// The step registry. A step is:
//   { id, label, short, component, visibleWhen(model), issues(model), done(model) }
// `model` is { form, errors, mediaCount }; `errors` is what validateItemForm found (or {}).
//   visibleWhen: false hides the step everywhere (section, navigation, stepper, progress).
//   issues:      the problems that belong to this step, in screen order (what the Review step lists).
//   done:        whether the tick in the navigation shows.
// The component receives { form, patch, errors, category, sections, focusOn, media, busy, checks, isNew, goTo }.
// Order here is the order on screen. Add a step by creating its file in this folder and adding one line to STEPS (see ../README.md).

const always = () => true;
const issuesFor = (id) => ({ errors }) => errorList(errors ?? {}).filter((e) => e.step === id);

export const STEPS = [
  { id: "media", label: "Media", short: "Media", component: MediaStep, visibleWhen: always, issues: issuesFor("media"), done: ({ mediaCount }) => mediaCount > 0 },
  { id: "basics", label: "Basics", short: "Basics", component: BasicsStep, visibleWhen: always, issues: issuesFor("basics"), done: ({ form }) => String(form.name ?? "").trim().length >= 2 },
  // Shown only for an item that went through the type picker (the key is on the form, null meaning Other goods). Other items see no new step.
  { id: "type", label: "Type", short: "Type", component: TypeStep, visibleWhen: ({ form }) => "productTypeId" in form, issues: () => [], done: ({ form }) => "productTypeId" in form },
  // Item options (B07). Shown for an item that went through the type picker or already has options; every other item sees no new step.
  { id: "options", label: "Options", short: "Options", component: OptionsStep, visibleWhen: ({ form }) => "productTypeId" in form || Boolean(form.options),
    issues: issuesFor("options"), done: ({ form }) => (form.options?.rows ?? []).some((r) => r.sold) },
  { id: "price", label: "Price and stock", short: "Price", component: PriceStep, visibleWhen: always, issues: issuesFor("price"), done: ({ form }) => !PRICED.includes(form.priceType) || parseKes(form.price) !== null },
  { id: "details", label: "Details", short: "Details", component: DetailsStep, visibleWhen: always, issues: issuesFor("details"),
    done: ({ form }) => (form.highlights?.length ?? 0) + (form.specs?.length ?? 0) + (form.includes?.length ?? 0) > 0 || filled(form.packSize) || filled(form.terms) || filled(form.brand) },
  { id: "review", label: "Review", short: "Review", component: ReviewStep, visibleWhen: always, issues: () => [], done: () => false },
];

// The steps the seller actually sees, in order. Everything that numbers, counts or steps through them uses this list.
export const visibleSteps = (model) => STEPS.filter((s) => s.visibleWhen(model));
