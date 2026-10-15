import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  Card,
  ConfirmDialog,
  CountUp,
  Drawer,
  EmptyState,
  EMPTY_ILLUSTRATIONS,
  IconButton,
  Modal,
  Skeleton,
  Sparkline,
  StatusChip,
  STATUS_MAP,
  Tabs,
  ToastProvider,
  useToast,
} from "./index.js";

describe("Button", () => {
  it("ignores clicks while loading but stays focusable", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit a form by default", async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<form onSubmit={onSubmit}><Button>Plain</Button></form>);
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("is named by its aria-label", () => {
    render(<IconButton aria-label="Close" icon={<svg />} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("refuses to render without a label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<IconButton icon={<svg />} />)).toThrow(/aria-label/);
    expect(() => render(<IconButton aria-label="  " icon={<svg />} />)).toThrow(/aria-label/);
    spy.mockRestore();
  });
});

describe("StatusChip", () => {
  it("shows icon, label and tone for every known status", () => {
    for (const [status, meta] of Object.entries(STATUS_MAP)) {
      const { container, unmount } = render(<StatusChip status={status} />);
      const chip = container.querySelector(`[data-status="${status}"]`);
      expect(chip).toHaveTextContent(meta.label);
      expect(chip.querySelector("svg")).not.toBeNull();
      expect(chip.className).toMatch(new RegExp(meta.tone));
      unmount();
    }
  });

  it("falls back to a readable neutral chip for an unknown status", () => {
    const { container } = render(<StatusChip status="needs_more_info" />);
    expect(container).toHaveTextContent("Needs more info");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("does not trip over inherited object keys", () => {
    const { container } = render(<StatusChip status="constructor" />);
    expect(container).toHaveTextContent("Constructor");
  });
});

describe("Card", () => {
  it("is a labelled region when it has a title", () => {
    render(<Card title="Payments">body</Card>);
    expect(screen.getByRole("region", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Payments" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("renders every illustration as a decorative graphic with a heading", () => {
    for (const illustration of EMPTY_ILLUSTRATIONS) {
      const { container, unmount } = render(<EmptyState illustration={illustration} title="Nothing here" />);
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
      unmount();
    }
  });
});

describe("Sparkline", () => {
  it("describes itself with start, end and range", () => {
    render(<Sparkline label="Applications per day" values={[2, 8, 5, 9]} />);
    expect(screen.getByRole("img", { name: "Applications per day: from 2 to 9, low 2, high 9" })).toBeInTheDocument();
  });

  it("handles empty, single and constant data without NaN", () => {
    for (const values of [[], [3], [4, 4, 4], [1, "x", null, 5]]) {
      const { container, unmount } = render(<Sparkline label="T" values={values} />);
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
      unmount();
    }
    render(<Sparkline label="T" values={[]} />);
    expect(screen.getByRole("img", { name: "T: not enough data" })).toBeInTheDocument();
  });
});

describe("CountUp", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("announces the final value immediately and counts the visible text", async () => {
    const { container } = render(<CountUp value={1200} duration={500} />);
    expect(container.querySelector(".u-sr-only")).toHaveTextContent("1,200");
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("0");
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("1,200");
  });

  it("shows the final value at once with a zero duration", () => {
    const { container } = render(<CountUp value={42} duration={0} />);
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("42");
  });

  it("shows the final value at once when the person prefers reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {} });
    const { container } = render(<CountUp value={77} />);
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("77");
    window.matchMedia = original;
  });
});

describe("Tabs", () => {
  const items = [
    { id: "a", label: "Alpha", content: "panel a" },
    { id: "b", label: "Beta", content: "panel b" },
    { id: "c", label: "Gamma", disabled: true, content: "panel c" },
    { id: "d", label: "Delta", content: "panel d" },
  ];

  it("wires tabs to panels and keeps only the selected tab in the Tab order", () => {
    render(<Tabs label="Sections" items={items} />);
    const tab = screen.getByRole("tab", { name: "Alpha" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves with arrows, wraps, skips disabled tabs and honours Home and End", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Sections" items={items} />);
    await user.click(screen.getByRole("tab", { name: "Alpha" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Delta" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Delta" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Delta" })).toHaveFocus();
  });

  it("only moves focus in manual mode until Enter is pressed", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Sections" activation="manual" items={items} />);
    await user.click(screen.getByRole("tab", { name: "Alpha" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");
  });
});

function ModalHarness({ initialOpen = false, dismissible = true }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Behind</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit plan" description="Pick one" dismissible={dismissible} footer={<button onClick={() => setOpen(false)}>Save</button>}>
        <input aria-label="Name" />
      </Modal>
    </>
  );
}

describe("Modal and Drawer", () => {
  it("is a labelled, described modal dialog and moves focus inside", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Edit plan" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Pick one");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("traps Tab in both directions", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    const inside = within(dialog).getAllByRole("button").concat(within(dialog).getByRole("textbox"));
    for (let i = 0; i < inside.length * 3; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < inside.length * 3; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes on a scrim click and on the close button", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(baseElement.querySelector("[aria-hidden='true'][class*='scrim']"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores Escape, scrim and the close button when not dismissible", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<ModalHarness initialOpen dismissible={false} />);
    await user.keyboard("{Escape}");
    await user.click(baseElement.querySelector("[aria-hidden='true'][class*='scrim']"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("makes the page behind inert and locks scrolling, then restores both", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(container).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("returns focus to a fallback when the opener has been removed", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      const [rowGone, setRowGone] = useState(false);
      const fallback = useRef(null);
      return (
        <>
          <button ref={fallback}>List</button>
          {!rowGone && <button onClick={() => setOpen(true)}>Row</button>}
          <Modal open={open} onClose={() => setOpen(false)} title="Delete row" returnFocusRef={fallback} footer={<button onClick={() => { setRowGone(true); setOpen(false); }}>Delete</button>} />
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Row" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "List" })).toHaveFocus();
  });

  it("lets only the top dialog handle Escape when dialogs are stacked", async () => {
    const user = userEvent.setup();
    function Stack() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <>
          <Modal open={a} onClose={() => setA(false)} title="First"><button>one</button></Modal>
          <Drawer open={b} onClose={() => setB(false)} title="Second"><button>two</button></Drawer>
        </>
      );
    }
    render(<Stack />);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("renders a drawer with the chosen side", () => {
    render(<Drawer open onClose={() => {}} title="Details" side="left"><p>x</p></Drawer>);
    expect(screen.getByRole("dialog", { name: "Details" }).className).toMatch(/side-left/);
  });
});

function ConfirmHarness(props) {
  const [open, setOpen] = useState(true);
  return <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Suspend?" confirmLabel="Suspend" {...props} />;
}

describe("ConfirmDialog", () => {
  it("is an alert dialog that keeps the action off until a reason is written", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    expect(screen.getByRole("alertdialog", { name: "Suspend?" })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Suspend" });
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toHaveFocus();
    await user.type(screen.getByLabelText("Reason"), "abc");
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/write a reason \(at least 5 characters\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason"), "def");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: "abcdef" });
  });

  it("does not count spaces as a reason", async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness onConfirm={() => {}} />);
    await user.type(screen.getByLabelText("Reason"), "        ");
    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
  });

  it("needs the exact typed text", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness confirmText="Mara Fresh Mart" onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Reason"), "Duplicate listing");
    const confirm = screen.getByRole("button", { name: "Suspend" });
    const typed = screen.getByLabelText(/Type Mara Fresh Mart to confirm/);
    await user.type(typed, "mara fresh mart");
    expect(confirm).toBeDisabled();
    await user.clear(typed);
    await user.type(typed, " Mara Fresh Mart ");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("works with the typed text only when no reason is required, and submits on Enter", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness requireReason={false} confirmText="DELETE" onConfirm={onConfirm} />);
    expect(screen.queryByLabelText("Reason")).toBeNull();
    await user.type(screen.getByLabelText(/Type DELETE/), "DELETE{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({ reason: "" });
  });

  it("shows loading, blocks dismissal and double submits, then shows an error and stays open", async () => {
    const user = userEvent.setup();
    let reject;
    const onConfirm = vi.fn(() => new Promise((_, r) => (reject = r)));
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Reason"), "Policy breach");
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Suspend" })).toHaveAttribute("aria-busy", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () => reject(new Error("Server said no")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server said no");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend" })).not.toHaveAttribute("aria-busy");
  });

  it("clears its fields each time it opens", async () => {
    const user = userEvent.setup();
    function Reopen() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)}>Again</button>
          <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={() => {}} title="Suspend?" />
        </>
      );
    }
    render(<Reopen />);
    await user.type(screen.getByLabelText("Reason"), "first attempt");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Again" }));
    expect(screen.getByLabelText("Reason")).toHaveValue("");
  });
});

function ToastHarness({ onUndo, onCommit }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.undo({ message: "Removed Mara", onUndo, onCommit })}>Remove</button>
      <button onClick={() => toast.error("Could not save")}>Fail</button>
      <button onClick={() => toast.success("Saved")}>Save</button>
    </>
  );
}

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const setup = (props = {}) =>
    render(
      <ToastProvider>
        <ToastHarness {...props} />
      </ToastProvider>,
    );

  it("runs Undo and does not commit", async () => {
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    setup({ onUndo, onCommit });
    fireEvent.click(screen.getByText("Remove"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Removed Mara")).toBeNull();
    await act(async () => vi.advanceTimersByTime(20000));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits once when the time runs out", async () => {
    const onCommit = vi.fn();
    setup({ onUndo: vi.fn(), onCommit });
    fireEvent.click(screen.getByText("Remove"));
    await act(async () => vi.advanceTimersByTime(7900));
    expect(screen.getByText("Removed Mara")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Removed Mara")).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits when dismissed with the close button", () => {
    const onCommit = vi.fn();
    setup({ onUndo: vi.fn(), onCommit });
    fireEvent.click(screen.getByText("Remove"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("pauses while hovered or focused and resumes afterwards", async () => {
    setup({ onUndo: vi.fn() });
    fireEvent.click(screen.getByText("Remove"));
    const toast = screen.getByRole("status");
    await act(async () => vi.advanceTimersByTime(5000));
    fireEvent.pointerEnter(toast);
    await act(async () => vi.advanceTimersByTime(60000));
    expect(screen.getByText("Removed Mara")).toBeInTheDocument();
    fireEvent.pointerLeave(toast);
    await act(async () => vi.advanceTimersByTime(3100));
    expect(screen.queryByText("Removed Mara")).toBeNull();
  });

  it("keeps errors until dismissed and announces them as alerts", async () => {
    setup();
    fireEvent.click(screen.getByText("Fail"));
    await act(async () => vi.advanceTimersByTime(120000));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows at most four at a time and still commits the one that was pushed out", async () => {
    const onCommit = vi.fn();
    setup({ onUndo: vi.fn(), onCommit });
    fireEvent.click(screen.getByText("Remove"));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Save"));
    await act(async () => {});
    expect(screen.queryByText("Removed Mara")).toBeNull();
    expect(screen.getAllByText("Saved")).toHaveLength(4);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the toast region out of the inert set while a dialog is open", async () => {
    function Both() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast.success("Saved")}>Save</button>
          <Modal open onClose={() => {}} title="Busy"><button>ok</button></Modal>
        </>
      );
    }
    const { baseElement } = render(<ToastProvider><Both /></ToastProvider>);
    expect(baseElement.querySelector("[data-toast-region]")).not.toHaveAttribute("inert");
  });

  it("throws a clear error outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ToastHarness />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe("component styles", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(here).filter((f) => f.endsWith(".module.css")).map((f) => join(here, f));
  const all = [...files, join(here, "../pages/KitPage.module.css")];

  it("find the stylesheets", () => expect(files.length).toBeGreaterThanOrEqual(11));

  for (const file of all) {
    const name = file.split("/").pop();
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    it(`${name} uses tokens, not raw colours`, () => {
      expect(css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
    });

    it(`${name} puts every :hover rule inside @media (hover: hover)`, () => {
      const outside = css.replace(/@media\s*\(hover:\s*hover\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
      expect(outside).not.toMatch(/:hover/);
    });
  }
});
