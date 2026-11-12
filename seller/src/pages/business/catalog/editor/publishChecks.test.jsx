import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { emptyItemForm, PRODUCT_TYPES } from "@epicmkt/shared";
import ReviewSection from "./ReviewSection.jsx";
import ReviewStep from "./steps/ReviewStep.jsx";
import { publishIssues } from "./checks/index.js";
import { qualityChecks } from "./model.js";

const mockTypes = vi.hoisted(() => ({ list: [] }));
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: mockTypes.list }) }));

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => {
  const r = await axe(node);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

const type = (id) => PRODUCT_TYPES.find((t) => t.id === id);
const water = type("drinking-water");
const phone = type("phone");
const necklace = type("gold-necklace");
const spec = (label, value) => ({ group: "Features & Specs", label, value });
const form = (extra = {}) => ({ ...emptyItemForm(), name: "Thing", price: "1000", ...extra });
const review = (f, props = {}) => render(<ReviewSection form={f} checks={qualityChecks(f, 1)} isNew={false} onJump={() => {}} {...props} />);

beforeEach(() => { mockTypes.list = [water, phone, necklace]; });

describe("publishIssues", () => {
  it("is null for an item with no type or no rows", () => {
    expect(publishIssues(form(), { type: null })).toBeNull();
    expect(publishIssues(form(), { type: { id: "x", specRows: [] } })).toBeNull();
  });

  it("a missing required row is a blocker pointing at its field; recommended rows are warnings", () => {
    const r = publishIssues(form(), { type: water });
    expect(r.canPublish).toBe(false);
    expect(r.blockers).toEqual([expect.objectContaining({ key: "water-type", step: "basics", focus: "row-water-type", message: "Water type is required" })]);
    expect(r.warnings.map((w) => w.key)).toEqual(["treatment-method", "container-material", "bottle-deposit", "quality-test"]);
    expect(r.warnings.every((w) => w.step === "details")).toBe(true);
    expect(r.score).toBe(0);
  });

  it("each blocker of the worked examples: water type, phone warranty", () => {
    expect(publishIssues(form({ specs: [] }), { type: phone }).blockers.map((b) => b.key)).toEqual(["warranty"]);
    const ok = publishIssues(form({ specs: [spec("Water type", "Spring")] }), { type: water });
    expect(ok.canPublish).toBe(true);
    expect(ok.blockers).toEqual([]);
  });

  it("an answer outside a choice list is a blocker with the allowed values", () => {
    const r = publishIssues(form({ specs: [spec("Water type", "Rain")] }), { type: water });
    expect(r.blockers[0].message).toBe("Water type must be one of: Purified, Borehole, Spring");
  });

  it("grandfathered: required rows become warnings and publishing stays possible", () => {
    const r = publishIssues(form(), { type: water, grandfathered: true });
    expect(r.canPublish).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.warnings[0]).toMatchObject({ key: "water-type", step: "basics" });
  });

  it("purity is needed once the chosen material carries the precious-metal tag", () => {
    const gold = { id: "g", kind: "material", label: "Gold", key: "gold", tags: ["precious-metal"] };
    const brass = { ...gold, id: "b", label: "Brass", key: "brass", tags: [] };
    const base = { options: undefined };
    expect(publishIssues(form({ ...base, specs: [spec("Material", "Gold")], specValues: { material: gold } }), { type: necklace }).blockers.map((b) => b.key)).toEqual(["purity"]);
    expect(publishIssues(form({ ...base, specs: [spec("Material", "Brass")], specValues: { material: brass } }), { type: necklace }).blockers).toEqual([]);
  });

  it("adds a warning for each colour without a photo and for a missing size chart, only when told", () => {
    const f = form({ specs: [spec("Water type", "Spring")] });
    expect(publishIssues(f, { type: water }).warnings.some((w) => w.id.startsWith("photo-") || w.id === "size-chart")).toBe(false);
    const r = publishIssues(f, { type: water, colourPhotos: [{ id: "red", label: "Red", count: 2 }, { id: "blue", label: "Blue", count: 0 }], sizeChart: { needed: true, has: false } });
    expect(r.warnings.filter((w) => w.id === "photo-blue" || w.id === "size-chart").map((w) => w.message)).toEqual(["Add a photo of the Blue colour", "Add a size chart so customers can choose a size"]);
    expect(r.canPublish).toBe(true);
  });
});

describe("Review: publishing", () => {
  it("lists blockers in words with an icon, jumps to the field, and keeps Publish off", async () => {
    const onJump = vi.fn();
    const onPublish = vi.fn();
    review(form(), { type: water, onJump, onPublish });
    const state = screen.getByTestId("publish-state");
    expect(within(state).getByText(/Not ready to publish: 1 thing needs fixing first/)).toBeInTheDocument();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(/Not ready to publish/);
    const jump = screen.getByRole("button", { name: /Needed to publish: Water type is required/ });
    expect(jump.querySelector("svg")).not.toBeNull();
    await userEvent.click(jump);
    expect(onJump).toHaveBeenCalledWith("basics", "row-water-type");
    await userEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("enables Publish when nothing blocks", async () => {
    const onPublish = vi.fn();
    review(form({ specs: [spec("Water type", "Purified")] }), { type: water, onPublish });
    expect(screen.getByText("Ready to publish.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("a problem the form check finds also keeps Publish off", () => {
    review(form({ name: "" }), { type: water, onPublish: () => {} });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("is disabled while saving", () => {
    review(form({ specs: [spec("Water type", "Purified")] }), { type: water, onPublish: () => {}, busy: true });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("grandfathered: warnings, no blockers, Publish on, and says why", () => {
    review(form(), { type: water, grandfathered: true, onPublish: () => {} });
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.getByText(/already live/)).toBeInTheDocument();
    expect(screen.queryByText(/Needed to publish:/)).toBeNull();
    expect(screen.getByRole("list", { name: "Suggested details" })).toBeInTheDocument();
  });

  it("shows the details score and the warnings in the quality panel", () => {
    review(form({ specs: [spec("Water type", "Purified"), spec("Treatment method", "UV")] }), { type: water });
    expect(screen.getByTestId("spec-score")).toHaveTextContent("25% of the recommended details");
    expect(screen.getByRole("progressbar", { name: "Item details" })).toHaveAttribute("aria-valuenow", "25");
    expect(within(screen.getByRole("list", { name: "Suggested details" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("has no Publish button unless the editor supplies one, and saving is never blocked here", () => {
    review(form(), { type: water });
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByText(/Nothing here stops you from saving/)).toBeInTheDocument();
  });
});

describe("Review: items with no type are unchanged", () => {
  it("no publishing block, no details block", () => {
    review(form(), { onPublish: () => {} });
    expect(screen.queryByTestId("publish-state")).toBeNull();
    expect(screen.queryByTestId("spec-quality")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByTestId("quality")).toBeInTheDocument();
  });
});

describe("ReviewStep", () => {
  it("finds the type by id for a typed item and ignores it otherwise", () => {
    const props = { checks: qualityChecks(form(), 0), isNew: false, goTo: () => {} };
    const typed = render(<ReviewStep form={form({ productTypeId: "drinking-water" })} {...props} />);
    expect(screen.getByTestId("publish-state")).toBeInTheDocument();
    typed.unmount();
    mockTypes.list = null;
    render(<ReviewStep form={form()} {...props} />);
    expect(screen.queryByTestId("publish-state")).toBeNull();
  });
});

describe("accessibility (axe)", () => {
  it("has no violations with blockers, with suggestions, and ready", async () => {
    const blocked = review(form(), { type: water, onPublish: () => {} });
    await noViolations(blocked.container);
    blocked.unmount();
    const ready = review(form({ specs: [spec("Water type", "Purified")] }), { type: water, onPublish: () => {} });
    await noViolations(ready.container);
  });
});
