import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { emptyItemForm, PRODUCT_TYPES } from "@epicmkt/shared";
import BasicsSection from "./BasicsSection.jsx";
import DetailsSection from "./DetailsSection.jsx";
import BasicsStep from "./steps/BasicsStep.jsx";
import DetailsStep from "./steps/DetailsStep.jsx";
import { setMoreDetails } from "./detailMode.js";
import { ownValue, withRow, rowsOf } from "./typedRows.js";

const mockTypes = vi.hoisted(() => ({ list: [] }));
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: mockTypes.list }) }));

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => {
  const r = await axe(node);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

const water = PRODUCT_TYPES.find((t) => t.id === "drinking-water");
const accessory = {
  id: "accessory",
  name: "Phone accessory",
  specRows: [
    { key: "kind", label: "Accessory", level: "required", input: "choice", choices: ["Case", "Cable"] },
    { key: "model", label: "Compatible model", level: "optional", input: "text", requiredIf: { row: "kind", in: ["Case"] } },
    { key: "fragile", label: "Fragile", level: "recommended", input: "boolean" },
    { key: "count", label: "Count", level: "optional", input: "number" },
    { key: "colour", label: "Colour", level: "optional", input: "openValue" },
    { key: "size", label: "Size", level: "optional", input: "dimension" }
  ]
};

const base = (extra = {}) => ({ ...emptyItemForm(), ...extra });

function Harness({ Section, initial, ...props }) {
  const [form, setForm] = useState(initial);
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <Section form={form} patch={patch} errors={{}} category="" sections={[]} focusOn={() => {}} {...props} />
      <output data-testid="specs">{JSON.stringify(form.specs)}</output>
    </>
  );
}

const Both = ({ initial, type }) => {
  const [more, setMore] = useState(false);
  const [form, setForm] = useState(initial);
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const shared = { form, patch, errors: {}, category: "", sections: [], focusOn: () => {}, type, more, onMore: () => setMore(true) };
  return <><BasicsSection {...shared} /><DetailsSection {...shared} /></>;
};

const specs = () => JSON.parse(screen.getByTestId("specs").textContent);

beforeEach(() => {
  setMoreDetails(false);
  mockTypes.list = [water, accessory];
});

describe("typed Basics: quick mode", () => {
  it("shows name, brand and the required rows only, with the rest behind Add more details", () => {
    render(<Harness Section={BasicsSection} initial={base({ productTypeId: "drinking-water" })} type={water} more={false} onMore={() => {}} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /brand/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Water type (required)" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Description/)).toBeNull();
    expect(screen.queryByLabelText(/^Short description/)).toBeNull();
    expect(screen.queryByLabelText(/^Section/)).toBeNull();
    expect(screen.queryByLabelText(/Treatment method/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add more details" })).toHaveAttribute("aria-expanded", "false");
  });

  it("needs only the type's required rows (water: one)", () => {
    const { required } = rowsOf(base(), water);
    expect(required.map((r) => r.key)).toEqual(["water-type"]);
  });

  it("Add more details reveals the descriptions and the section", async () => {
    render(<Both initial={base({ productTypeId: "drinking-water" })} type={water} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Add more details" })[0]);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Section/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add more details" })).toBeNull();
  });
});

describe("typed Details", () => {
  it("quick mode shows only the invitation; full mode shows recommended rows and the usual blocks", async () => {
    render(<Both initial={base({ productTypeId: "drinking-water" })} type={water} />);
    expect(screen.queryByRole("heading", { name: "Specifications" })).toBeNull();
    expect(screen.queryByLabelText(/Treatment method/)).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Add more details" })[0]);
    expect(screen.getByLabelText("Treatment method (recommended)")).toBeInTheDocument();
    expect(screen.getByLabelText("Bottle deposit (recommended)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Specifications" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
  });

  it("marks recommended and optional rows in words", async () => {
    render(<Harness Section={DetailsSection} initial={base({ productTypeId: "accessory" })} type={accessory} more onMore={() => {}} />);
    expect(screen.getByRole("group", { name: "Fragile (recommended)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Count (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Accessory/)).toBeNull();
  });
});

describe("legacy items", () => {
  it("with no type, Basics and Details render the usual form with no mode button and no type rows", () => {
    render(<Both initial={base()} type={null} />);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Section/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Specifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add more details" })).toBeNull();
    expect(document.querySelector('[data-area="typerows"]')).toBeNull();
  });

  it("a type with no rows behaves as no type", () => {
    render(<Both initial={base({ productTypeId: "x" })} type={{ id: "x", name: "X", specRows: [] }} />);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add more details" })).toBeNull();
  });
});

describe("row inputs write the item's specifications", () => {
  it("a choice row adds a spec with the row's label and clears it again", async () => {
    render(<Harness Section={BasicsSection} initial={base({ productTypeId: "drinking-water" })} type={water} more={false} onMore={() => {}} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Water type (required)" }), "Borehole");
    expect(specs()).toEqual([{ group: "Features & Specs", label: "Water type", value: "Borehole" }]);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Water type (required)" }), "Spring");
    expect(specs()).toHaveLength(1);
    expect(specs()[0].value).toBe("Spring");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Water type (required)" }), "");
    expect(specs()).toEqual([]);
  });

  it("an existing spec with the same label in other case is reused, not duplicated", () => {
    const form = base({ specs: [{ group: "Measurements", label: "WATER TYPE", value: "Spring" }] });
    expect(ownValue(form, { label: "Water type" })).toBe("Spring");
    expect(withRow(form, { label: "Water type" }, "Borehole")).toEqual([{ group: "Measurements", label: "WATER TYPE", value: "Borehole" }]);
  });

  it("keeps a saved value that is not in the list", () => {
    const form = base({ productTypeId: "drinking-water", specs: [{ group: "Features & Specs", label: "Water type", value: "Rain" }] });
    render(<Harness Section={BasicsSection} initial={form} type={water} more={false} onMore={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Water type (required)" })).toHaveValue("Rain");
  });

  it("boolean, number, open value and dimension rows are plain inputs for now", async () => {
    render(<Harness Section={DetailsSection} initial={base({ productTypeId: "accessory" })} type={accessory} more onMore={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    await userEvent.type(screen.getByLabelText("Count (optional)"), "12");
    await userEvent.type(screen.getByLabelText("Colour (optional)"), "Wine red");
    await userEvent.type(screen.getByLabelText("Size (optional)"), "10 x 5");
    expect(specs().map((s) => [s.label, s.value])).toEqual([["Fragile", "Yes"], ["Count", "12"], ["Colour", "Wine red"], ["Size", "10 x 5"]]);
    expect(screen.getByLabelText("Count (optional)")).toHaveAttribute("inputmode", "decimal");
  });

  it("a conditional row becomes required when its condition is met", async () => {
    render(<Harness Section={BasicsSection} initial={base({ productTypeId: "accessory" })} type={accessory} more={false} onMore={() => {}} />);
    expect(screen.queryByLabelText(/Compatible model/)).toBeNull();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Accessory (required)" }), "Case");
    expect(screen.getByLabelText("Compatible model (required)")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Accessory (required)" }), "Cable");
    expect(screen.queryByLabelText(/Compatible model/)).toBeNull();
  });
});

describe("steps", () => {
  const props = (form) => ({ form, patch: () => {}, errors: {}, category: "", sections: [], focusOn: () => {} });

  it("a typed item gets the quick Basics and its mode is shared with Details", async () => {
    const form = base({ productTypeId: "drinking-water" });
    render(<><BasicsStep {...props(form)} /><DetailsStep {...props(form)} /></>);
    expect(screen.queryByLabelText(/^Description/)).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Add more details" })[0]);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
    expect(screen.getByLabelText("Treatment method (recommended)")).toBeInTheDocument();
  });

  it("an item with no type never asks for product types", () => {
    mockTypes.list = null;
    render(<BasicsStep {...props(base())} />);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
  });

  it("shows the generic form until the type is known", () => {
    mockTypes.list = [];
    render(<BasicsStep {...props(base({ productTypeId: "drinking-water" }))} />);
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
  });
});

describe("accessibility (axe)", () => {
  it("has no violations in quick Basics, full Basics and full Details", async () => {
    const quick = render(<Harness Section={BasicsSection} initial={base({ productTypeId: "accessory" })} type={accessory} more={false} onMore={() => {}} />);
    await noViolations(quick.container);
    quick.unmount();
    const full = render(<Both initial={base({ productTypeId: "accessory" })} type={accessory} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Add more details" })[0]);
    await noViolations(full.container);
  });
});
