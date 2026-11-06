import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import OpenValueInput from "./OpenValueInput.jsx";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noViolations = async (node) => {
  const r = await axe(node);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

const V = (id, label, extra = {}) => ({ id, kind: "material", label, key: label.toLowerCase(), status: "approved", hex: null, tags: [], uses: 0, ...extra });
const MAHOGANY = V("m1", "Mahogany");
const VENEER = V("m2", "Mahogany veneer");
const SAMSUNG = V("b1", "Samsung", { kind: "brand" });

// A mocked seller_option_values / seller_add_option_value pair.
function mockSource({ matches = [], canAdd = true, add } = {}) {
  return {
    search: vi.fn(async () => ({ matches, canAdd, addLabel: null })),
    add: vi.fn(add ?? (async (kind, label) => ({ created: true, value: V("new", label, { kind, status: "pending" }) }))),
  };
}

function Harness({ source, initial = null, onValue, ...props }) {
  const [value, setValue] = useState(initial);
  return <OpenValueInput kind="material" label="Material" debounceMs={0} source={source} value={value} onChange={(v) => { setValue(v); onValue?.(v); }} {...props} />;
}

describe("OpenValueInput: suggestions", () => {
  it("shows Mahogany and Mahogany veneer for \"Mahog\", asking the source with the typed text", async () => {
    const source = mockSource({ matches: [MAHOGANY, VENEER], canAdd: true });
    const user = userEvent.setup();
    render(<Harness source={source} />);
    await user.type(screen.getByRole("combobox", { name: "Material" }), "Mahog");
    const list = await screen.findByRole("listbox", { name: "Material suggestions" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Mahogany", "Mahogany veneer", expect.stringContaining("Add “Mahog”")]);
    expect(source.search).toHaveBeenLastCalledWith("material", "Mahog", { limit: 8 });
  });

  it("chooses with the keyboard: arrows move and wrap, aria-activedescendant follows, Enter picks", async () => {
    const source = mockSource({ matches: [MAHOGANY, VENEER], canAdd: false });
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    const box = screen.getByRole("combobox");
    await user.type(box, "mahog");
    await screen.findAllByRole("option");
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    const [first, second] = screen.getAllByRole("option");
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowUp}");
    expect(box).toHaveAttribute("aria-activedescendant", second.id);
    await user.keyboard("{Enter}");
    expect(onValue).toHaveBeenCalledWith(VENEER);
    expect(await screen.findByTestId("value-chip")).toHaveTextContent("Mahogany veneer");
  });

  it("wires the combobox to its list and label", async () => {
    const user = userEvent.setup();
    render(<Harness source={mockSource({ matches: [MAHOGANY] })} required hint="What it is made of." />);
    const box = screen.getByRole("combobox", { name: /Material \(required\)/ });
    expect(box).toHaveAttribute("aria-autocomplete", "list");
    expect(box).toHaveAttribute("aria-required", "true");
    expect(box).toHaveAccessibleDescription(expect.stringContaining("What it is made of."));
    await user.click(box);
    await screen.findByRole("option", { name: "Mahogany" });
    expect(document.getElementById(box.getAttribute("aria-controls"))).toBe(screen.getByRole("listbox"));
  });

  it("Escape closes the list first, then clears the text; Alt+Down reopens", async () => {
    const user = userEvent.setup();
    render(<Harness source={mockSource({ matches: [MAHOGANY] })} />);
    const box = screen.getByRole("combobox");
    await user.type(box, "mah");
    await screen.findByRole("option", { name: "Mahogany" });
    await user.keyboard("{Escape}");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).toHaveValue("mah");
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(box).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}{Escape}");
    expect(box).toHaveValue("");
  });

  it("tells screen readers what is happening in a polite live region", async () => {
    const user = userEvent.setup();
    render(<Harness source={mockSource({ matches: [MAHOGANY, VENEER], canAdd: false })} />);
    await user.type(screen.getByRole("combobox"), "mah");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 suggestions. Use the up and down arrow keys"));
  });

  it("ignores a slow answer to an older query", async () => {
    let release;
    const slow = new Promise((r) => { release = r; });
    const source = {
      search: vi.fn(async (kind, q) => (q === "m" ? slow : { matches: [VENEER], canAdd: false })),
      add: vi.fn(),
    };
    const user = userEvent.setup();
    render(<Harness source={source} />);
    const box = screen.getByRole("combobox");
    await user.type(box, "m");
    await user.type(box, "a");
    await screen.findByRole("option", { name: "Mahogany veneer" });
    release({ matches: [MAHOGANY], canAdd: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("option", { name: "Mahogany" })).not.toBeInTheDocument();
  });

  it("says so when suggestions fail, and when there is no source", async () => {
    const user = userEvent.setup();
    const bad = { search: vi.fn(async () => { throw new Error("offline"); }), add: vi.fn() };
    const { unmount } = render(<Harness source={bad} />);
    await user.type(screen.getByRole("combobox"), "x");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("could not load suggestions"));
    unmount();
    render(<Harness source={null} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("not available");
  });
});

describe("OpenValueInput: typing a new value", () => {
  it("offers Add “Mahogany” when nothing matches; adding is usable at once, shown as typed and flagged pending", async () => {
    const source = mockSource({ matches: [], canAdd: true });
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={source} onValue={onValue} />);
    await user.type(screen.getByRole("combobox"), "  Mahogany ");
    await user.click(await screen.findByRole("option", { name: /Add “Mahogany”/ }));
    expect(source.add).toHaveBeenCalledWith("material", "Mahogany", null);
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({ label: "Mahogany", status: "pending" }));
    const chip = await screen.findByTestId("value-chip");
    expect(chip).toHaveTextContent("Mahogany");
    expect(chip).toHaveTextContent("Pending review");
    expect(chip).toHaveAccessibleDescription(expect.stringContaining("exactly as you typed it"));
    expect(screen.getByRole("status")).toHaveTextContent("pending review");
  });

  it("adds with Enter when Add is the only choice, and keeps the label the seller typed", async () => {
    const source = mockSource({ matches: [], canAdd: true });
    const user = userEvent.setup();
    render(<Harness source={source} />);
    await user.type(screen.getByRole("combobox"), "wine   RED{Enter}");
    await waitFor(() => expect(source.add).toHaveBeenCalledWith("material", "wine RED", null));
  });

  it("passes the shade to add when one is given", async () => {
    const source = mockSource({ matches: [], canAdd: true });
    const user = userEvent.setup();
    render(<Harness source={source} kind="color" addHex="#8b1a2b" />);
    await user.type(screen.getByRole("combobox"), "Wine red");
    expect(await screen.findByText(/with this shade/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(source.add).toHaveBeenCalledWith("color", "Wine red", "#8b1a2b"));
  });

  it("does not offer Add for text with no letters or numbers, or one that is too long", async () => {
    const source = mockSource({ matches: [], canAdd: true });
    const user = userEvent.setup();
    render(<Harness source={source} />);
    const box = screen.getByRole("combobox");
    await user.type(box, "---");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("letters or numbers"));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(source.add).not.toHaveBeenCalled();
    await user.clear(box);
    await user.type(box, "x".repeat(61));
    expect(screen.getByRole("alert")).toHaveTextContent("up to 60 characters");
    expect(box).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the text and shows a message when adding fails", async () => {
    const source = mockSource({ canAdd: true, add: async () => { throw Object.assign(new Error("too_many_pending"), { code: "too_many_pending" }); } });
    const user = userEvent.setup();
    render(<Harness source={source} />);
    const box = screen.getByRole("combobox");
    await user.type(box, "Teak");
    await user.click(await screen.findByRole("option", { name: /Add “Teak”/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("waiting for review");
    expect(box).toHaveValue("Teak");
  });

  it("blocks Add and says why when the parent asks for it", async () => {
    const user = userEvent.setup();
    render(<Harness source={mockSource({ canAdd: true })} blockAdd="A shade looks like #A1B2C3." />);
    await user.type(screen.getByRole("combobox"), "Teal");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A shade looks like"));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});

describe("OpenValueInput: duplicates resolve to one value", () => {
  it("typing SAMSUNG offers no Add and Enter chooses the existing Samsung", async () => {
    const source = mockSource({ matches: [SAMSUNG], canAdd: false });
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness kind="brand" label="Brand" source={source} onValue={onValue} />);
    await user.type(screen.getByRole("combobox"), "SAMSUNG");
    await screen.findByRole("option", { name: "Samsung" });
    expect(screen.queryByRole("option", { name: /Add/ })).not.toBeInTheDocument();
    expect(screen.getByText("“SAMSUNG” is already in the list as “Samsung”.")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onValue).toHaveBeenCalledWith(SAMSUNG);
    expect(source.add).not.toHaveBeenCalled();
  });

  it("does not offer Add even if the source says canAdd but the same key is in the list", async () => {
    const source = mockSource({ matches: [SAMSUNG], canAdd: true });
    const user = userEvent.setup();
    render(<Harness kind="brand" label="Brand" source={source} />);
    await user.type(screen.getByRole("combobox"), "samsung");
    await screen.findByRole("option", { name: "Samsung" });
    expect(screen.queryByRole("option", { name: /Add/ })).not.toBeInTheDocument();
  });

  it("a merged spelling typed in full resolves to its target", async () => {
    const source = mockSource({ matches: [SAMSUNG], canAdd: false });
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness kind="brand" label="Brand" source={source} onValue={onValue} />);
    await user.type(screen.getByRole("combobox"), "Sammy{Enter}");
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(SAMSUNG));
  });

  it("Enter pressed before the lookup finished still decides from a fresh answer", async () => {
    const source = mockSource({ matches: [SAMSUNG], canAdd: false });
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness kind="brand" label="Brand" source={source} onValue={onValue} debounceMs={500} />);
    await user.type(screen.getByRole("combobox"), "samsung{Enter}");
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(SAMSUNG));
    expect(source.add).not.toHaveBeenCalled();
  });

  it("if add finds the value already exists, it uses that one and says so", async () => {
    const source = mockSource({ matches: [], canAdd: true, add: async () => ({ created: false, value: V("m1", "Mahogany") }) });
    const user = userEvent.setup();
    render(<Harness source={source} />);
    await user.type(screen.getByRole("combobox"), "mahogany!");
    await user.click(await screen.findByRole("option", { name: /Add/ }));
    expect(await screen.findByTestId("value-chip")).not.toHaveTextContent("Pending");
    expect(screen.getByRole("status")).toHaveTextContent("already in the list");
  });
});

describe("OpenValueInput: the chosen value", () => {
  it("Change brings back the input with the text, focused, and clears the value", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness source={mockSource()} initial={MAHOGANY} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Change Material: Mahogany" }));
    expect(onValue).toHaveBeenLastCalledWith(null);
    const box = await screen.findByRole("combobox");
    expect(box).toHaveValue("Mahogany");
    expect(box).toHaveFocus();
  });

  it("moves focus to Change after choosing, so keyboard users are not dropped", async () => {
    const user = userEvent.setup();
    render(<Harness source={mockSource({ matches: [MAHOGANY], canAdd: false })} />);
    await user.type(screen.getByRole("combobox"), "mahogany{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: /Change Material/ })).toHaveFocus());
  });

  it("shows a colour with a shade as a swatch card and without one as a text card", () => {
    const { rerender } = render(<Harness source={mockSource()} kind="color" initial={V("c1", "Wine red", { kind: "color", hex: "#8b1a2b" })} />);
    expect(screen.getByTestId("value-chip")).toHaveAttribute("data-card", "swatch");
    expect(screen.getByRole("img", { name: "Colour sample for Wine red" })).toBeInTheDocument();
    rerender(<Harness key="b" source={mockSource()} kind="color" initial={V("c2", "Sage", { kind: "color" })} />);
    expect(screen.getByTestId("value-chip")).toHaveAttribute("data-card", "text");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("OpenValueInput: accessibility (axe)", () => {
  it("has no violations closed, open with options, with an error, and with a chosen pending value", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<Harness source={mockSource({ matches: [MAHOGANY, VENEER], canAdd: true })} hint="Hint text" required />);
    await noViolations(container);
    await user.type(screen.getByRole("combobox"), "Mahog");
    await screen.findAllByRole("option");
    await noViolations(container);
    unmount();
    const bad = render(<Harness source={mockSource()} error="Pick a material." />);
    await noViolations(bad.container);
    bad.unmount();
    const chosen = render(<Harness source={mockSource()} initial={V("n", "Teak", { status: "pending" })} />);
    await noViolations(chosen.container);
  });
});
