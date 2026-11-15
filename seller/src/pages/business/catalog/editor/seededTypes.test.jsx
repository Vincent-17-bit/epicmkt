// 11.2: the boutique, electronics and cyber types from the seeds work in the real editor steps: their own axes are offered as the
// starting options, and their spec rows drive the publish checks.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { specIssues } from "@epicmkt/shared";
import { ALL_TYPES } from "../../../../../../scripts/seeds/index.mjs";
import OptionsStep from "./steps/OptionsStep.jsx";
import { publishIssues } from "./checks/publish.js";

const typeOf = (id) => ALL_TYPES.find((t) => t.id === id);
// seller_product_types returns the type with `specRows` and axes as { key, label, display, scale?, suggested? }
const asServed = (t) => ({ id: t.id, name: t.name, kind: t.kind, departmentId: t.departmentId, categoryIds: t.categoryIds, quantityMode: t.quantityMode, axes: t.axes, specRows: t.specRows });
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: window.__types ?? [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));

function Harness({ id }) {
  const [form, setForm] = useState({ productTypeId: id, price: "1000", options: undefined });
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}

describe("seeded types in the editor", () => {
  it.each([
    ["clothing", "boutique", ["Colour", "Size"]],
    ["laptop", "electronics", ["Colour", "RAM", "Storage"]],
    ["printing", "cyber", ["Paper size", "Colour mode", "Sides"]]
  ])("%s (%s): its own axes are the starting options", (id, _shop, labels) => {
    window.__types = [asServed(typeOf(id))];
    render(<Harness id={id} />);
    for (const label of labels) expect(screen.getByRole("button", { name: new RegExp(`^(Add )?${label}$`) })).toBeInTheDocument();
  });

  it("starting an axis from the type brings in its suggested values", async () => {
    window.__types = [asServed(typeOf("laptop"))];
    const user = userEvent.setup();
    render(<Harness id="laptop" />);
    await user.click(screen.getByRole("button", { name: /^(Add )?RAM$/ }));
    expect(screen.getByRole("group", { name: "Values for RAM" })).toBeInTheDocument();
  });

  it("the publish check follows the seeded rows: a laptop is blocked until brand, model, processor and condition are given", () => {
    const type = asServed(typeOf("laptop"));
    const blocked = publishIssues({ name: "Laptop", specs: [] }, { type });
    expect(blocked.canPublish).toBe(false);
    expect(blocked.blockers.map((b) => b.key).sort()).toEqual(["brand", "condition", "model", "processor"]);
    const specs = [["Brand", "Lenovo"], ["Model", "T14"], ["Processor", "i5"], ["Condition", "New"]].map(([label, value]) => ({ label, value }));
    expect(publishIssues({ name: "Laptop", specs }, { type }).canPublish).toBe(true);
  });

  it("jewellery needs purity only for gold or silver", () => {
    const type = asServed(typeOf("ring"));
    const item = (material) => ({ specs: [{ label: "Material", value: material }] });
    const tags = { gold: ["precious-metal"] };
    expect(specIssues(item("Gold"), type, { tags }).blockers.map((b) => b.key)).toContain("purity");
    expect(specIssues(item("Brass"), type, { tags }).blockers.map((b) => b.key)).not.toContain("purity");
  });
});
