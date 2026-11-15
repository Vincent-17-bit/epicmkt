// The plan feature switches (admin, 11.5): a switch that is off stops new use of the feature in the seller app and says so.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import * as mock from "../../api/mock.js";
import { M, signedInApp } from "../../test/utils.jsx";
import { visibleSteps } from "./catalog/editor/steps/index.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const withSwitches = (features) => {
  const real = mock.getSubscription;
  vi.spyOn(api, "getSubscription").mockImplementation(async () => {
    const out = await real();
    return { ...out, limits: { standard: { ...out.limits.standard, features }, premium: { ...out.limits.premium, features } } };
  });
};

describe("steps", () => {
  const typed = { productTypeId: "phone" };
  it("hides the Options step for an item with no options when the plan has them off, and keeps it for one that has them", () => {
    const ids = (form, features) => visibleSteps({ form, errors: {}, mediaCount: 1, features }).map((s) => s.id);
    expect(ids(typed, undefined)).toContain("options");
    expect(ids(typed, { options: true })).toContain("options");
    expect(ids(typed, { options: false })).not.toContain("options");
    expect(ids({ ...typed, options: { axes: [{ key: "colour" }], rows: [], defaultKey: null } }, { options: false })).toContain("options");
  });
});

describe("pages", () => {
  it("shows the demand page as 'not part of your plan' and drops it from the menu", async () => {
    withSwitches({ demand: false });
    await signedInApp("/business/demand", async () => M.setBusiness({ planKey: "premium" }));
    expect(await screen.findByText("This is not part of your plan.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "What shoppers want" })).toBeNull();
  });

  it("keeps the demand page when the switch is on", async () => {
    withSwitches({ demand: true });
    await signedInApp("/business/demand", async () => M.setBusiness({ planKey: "premium" }));
    expect(await screen.findByRole("heading", { name: "What shoppers want" })).toBeInTheDocument();
    expect(screen.queryByText("This is not part of your plan.")).toBeNull();
  });

  it("will not let a shop that does not deliver start, but lets one that does switch it off", async () => {
    withSwitches({ delivery: false });
    await signedInApp("/business/settings", async () => M.setBusiness({ planKey: "premium" }));
    const section = (await screen.findByRole("heading", { name: "Delivery" })).closest("section");
    expect(within(section).getByRole("note")).toHaveTextContent("Delivery is not part of your plan.");
    expect(within(section).getByRole("switch", { name: "I deliver" })).toBeDisabled();
  });
});
