import { describe, test, expect } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FIELD_TYPES } from "@epicmkt/shared";
import { TemplateFields, pruneAttributes } from "./TemplateFields.jsx";

const opts = [{ value: "a", label: "Alpha" }, { value: "b", label: "Bravo" }];
const FIELDS = [
  { key: "t", label: "Text field", type: "text", group: "One", showOnCard: true },
  { key: "lt", label: "Long text", type: "longtext", group: "One" },
  { key: "n", label: "Number field", type: "number", unit: "seats", group: "One", filterable: true },
  { key: "p", label: "Price field", type: "price", group: "Two" },
  { key: "bool", label: "Flag field", type: "boolean", group: "Two", filterable: true, showOnCard: true },
  { key: "sel", label: "Select field", type: "select", options: opts, group: "Two" },
  { key: "multi", label: "Multi field", type: "multiselect", options: opts, group: "Three" },
  { key: "hrs", label: "Hours field", type: "timerange", group: "Three" },
  { key: "link", label: "Link field", type: "url", group: "Three" },
  { key: "img", label: "Image field", type: "image", group: "Three" },
  { key: "list", label: "Price list", type: "itemlist", group: "Four" },
  { key: "fee", label: "Fee field", type: "price", group: "Four", showIf: { key: "bool", equals: true } },
];

function Harness({ fields = FIELDS, initial = {}, spy }) {
  const [values, setValues] = useState(initial);
  spy.current = values;
  return <TemplateFields fields={fields} values={values} onChange={setValues} errors={{}} />;
}

describe("TemplateFields", () => {
  test("the test template covers every field type the shared template defines", () => {
    const covered = new Set(FIELDS.map((f) => f.type));
    for (const type of FIELD_TYPES ?? [...covered]) expect(covered.has(type)).toBe(true);
  });

  test("renders every type, grouped, with filter and card flags", () => {
    render(<Harness spy={{ current: null }} />);
    for (const g of ["One", "Two", "Three", "Four"]) expect(screen.getByRole("heading", { name: g })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Text field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Long text/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Number field \(seats\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Price field \(KSh\)/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Flag field/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Select field/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Multi field/ })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText(/^Link field/)).toHaveAttribute("type", "url");
    expect(screen.getByLabelText(/^Image field/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Price list/ })).toBeInTheDocument();
    expect(screen.getAllByText("Filter")).toHaveLength(2);
    expect(screen.getAllByText("On listing card")).toHaveLength(2);
  });

  test("values are captured per type", async () => {
    const spy = { current: null };
    const user = userEvent.setup();
    render(<Harness spy={spy} />);
    await user.type(screen.getByLabelText(/^Text field/), "hello");
    await user.type(screen.getByLabelText(/^Number field/), "12x");
    await user.type(screen.getByLabelText(/^Price field/), "300");
    await user.selectOptions(screen.getByLabelText(/^Select field/), "b");
    const multi = screen.getByRole("group", { name: /Multi field/ });
    await user.click(within(multi).getByRole("checkbox", { name: "Bravo" }));
    await user.click(within(multi).getByRole("checkbox", { name: "Alpha" }));
    await user.type(screen.getByLabelText("From"), "08:00");
    await user.type(screen.getByLabelText("To"), "17:30");
    await user.click(screen.getByRole("button", { name: "Add a line" }));
    await user.type(screen.getByLabelText("Name"), "Wash");
    await user.type(screen.getByLabelText("Price (KSh)"), "50");
    expect(spy.current).toMatchObject({ t: "hello", n: 12, p: 300, sel: "b", multi: ["a", "b"], hrs: ["08:00", "17:30"], list: [{ name: "Wash", price: 50 }] });
  });

  test("showIf reveals a dependent field, and hiding it drops its value", async () => {
    const spy = { current: null };
    const user = userEvent.setup();
    render(<Harness spy={spy} />);
    expect(screen.queryByLabelText(/^Fee field/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Flag field/ }));
    await user.type(screen.getByLabelText(/^Fee field/), "75");
    expect(spy.current).toMatchObject({ bool: true, fee: 75 });
    await user.click(screen.getByRole("checkbox", { name: /Flag field/ }));
    expect(screen.queryByLabelText(/^Fee field/)).not.toBeInTheDocument();
    expect(spy.current.fee).toBeUndefined();
    expect(spy.current.bool).toBe(false);
  });

  test("clearing a field removes the key instead of saving an empty value", async () => {
    const spy = { current: null };
    const user = userEvent.setup();
    render(<Harness spy={spy} initial={{ t: "x" }} />);
    await user.clear(screen.getByLabelText(/^Text field/));
    expect("t" in spy.current).toBe(false);
  });

  test("pruneAttributes keeps keys the template does not know (so validation can flag them)", () => {
    expect(pruneAttributes(FIELDS, { zzz: 1, t: "", bool: false, fee: 5 })).toEqual({ zzz: 1, bool: false });
  });
});
