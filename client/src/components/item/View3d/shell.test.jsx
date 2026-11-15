import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { seriousViolations } from "../../../test/axe.js";
import Shell from "./Shell.jsx";
import { viewFor } from "./Entry.jsx";
import { kindsOf } from "./engine.js";

const VIEW = { poster: "https://img.test/poster.jpg", model: { url: "https://m.test/a.glb", size: 1000 }, spin: { frames: ["a", "b", "c"], count: 3 } };
const SPIN_ONLY = { poster: VIEW.poster, spin: VIEW.spin };

// A stub engine that records what the shell asks of it.
const stub = (over = {}) => {
  const calls = [];
  let zoom = 1;
  const engine = {
    mount: vi.fn(async (el) => { calls.push("mount"); el.setAttribute("data-mounted", "yes"); if (over.mountError) throw new Error(over.mountError); }),
    setZoom: vi.fn((z) => { zoom = Math.min(4, Math.max(1, z)); calls.push(`zoom:${zoom}`); return zoom; }),
    rotateBy: vi.fn((n) => calls.push(`rotate:${n}`)),
    setAutoRotate: vi.fn((on) => calls.push(`auto:${on}`)),
    destroy: vi.fn(() => calls.push("destroy"))
  };
  return { engine, calls };
};
const loader = (byKind) => vi.fn(async (kind) => byKind[kind].engine);
const matchMedia = (reduce) => { window.matchMedia = (q) => ({ matches: reduce && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }); };
afterEach(() => { delete window.matchMedia; document.body.innerHTML = ""; });

describe("View in 3D", () => {
  it("is not there without a 3D view or without a poster", () => {
    const { container, rerender } = render(<Shell view={null} name="Mug" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Shell view={{ spin: VIEW.spin }} name="Mug" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("chooses engines by data: the model first, then the spin", () => {
    expect(kindsOf(VIEW)).toEqual(["model", "spin"]);
    expect(kindsOf(SPIN_ONLY)).toEqual(["spin"]);
    expect(kindsOf({ poster: "p" })).toEqual([]);
  });

  it("loads no engine until the modal opens, then shows the poster until it is ready", async () => {
    const spin = stub();
    const load = loader({ spin });
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={load} />);
    expect(load).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "3D view of Mug" })).toBeInTheDocument();
    await waitFor(() => expect(spin.engine.mount).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Zoom in" })).toBeEnabled());
    expect(dialog.querySelector("img[src='https://img.test/poster.jpg']")).toBeNull(); // the poster steps aside once the engine is ready
    expect(load).toHaveBeenCalledWith("spin", SPIN_ONLY);
  });

  it("zooms within the bounds with the buttons and the keyboard, and resets", async () => {
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    await waitFor(() => expect(zoomIn).toBeEnabled());
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    for (let i = 0; i < 6; i += 1) { if (!zoomIn.disabled) await user.click(zoomIn); }
    expect(zoomIn).toBeDisabled();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Zoom 400%");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    const stage = screen.getByRole("group", { name: /3D view/ });
    stage.focus();
    await user.keyboard("+");
    expect(spin.engine.setZoom).toHaveBeenLastCalledWith(1.5);
    await user.keyboard("0");
    expect(spin.engine.setZoom).toHaveBeenLastCalledWith(1);
  });

  it("turns with the arrow keys and the buttons", async () => {
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn left" })).toBeEnabled());
    screen.getByRole("group", { name: /3D view/ }).focus();
    await user.keyboard("{ArrowRight}{ArrowLeft}{ArrowLeft}");
    expect(spin.engine.rotateBy.mock.calls.map((c) => c[0])).toEqual([1, -1, -1]);
    await user.click(screen.getByRole("button", { name: "Turn right" }));
    expect(spin.engine.rotateBy).toHaveBeenLastCalledWith(1);
  });

  it("starts auto-orbit, which the toggle turns off", async () => {
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    const toggle = await screen.findByRole("button", { name: "Auto-turn" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(spin.engine.setAutoRotate).toHaveBeenLastCalledWith(false);
  });

  it("keeps auto-orbit off when the visitor asks for reduced motion", async () => {
    const spin = stub();
    matchMedia(true);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    const toggle = await screen.findByRole("button", { name: "Auto-turn" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(spin.engine.setAutoRotate).toHaveBeenCalledWith(false);
  });

  it("offers a toggle when both exist, and falls back from the model to the spin when WebGL is missing", async () => {
    const model = stub({ mountError: "webgl_unavailable" });
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={VIEW} name="Mug" load={loader({ model, spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    await waitFor(() => expect(spin.engine.mount).toHaveBeenCalled());
    expect(model.engine.destroy).toHaveBeenCalled();
    const group = await screen.findByRole("group", { name: "Kind of 3D view" });
    expect(within(group).getByRole("button", { name: "Photo spin" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "3D model" }));
    await waitFor(() => expect(spin.engine.destroy).toHaveBeenCalled());
  });

  it("falls back to the photos when no engine can start", async () => {
    const spin = stub({ mountError: "spin_unavailable" });
    const onFallback = vi.fn();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} onFallback={onFallback} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not start on this device");
    expect(screen.getByRole("img", { name: "Mug" })).toHaveAttribute("src", VIEW.poster);
    await user.click(screen.getByRole("button", { name: "See the photos" }));
    expect(onFallback).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("destroys the engine when the modal closes", async () => {
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    await waitFor(() => expect(spin.engine.mount).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(spin.engine.destroy).toHaveBeenCalled());
  });

  it("has no serious accessibility violations, closed and open", async () => {
    const spin = stub();
    matchMedia(false);
    const user = userEvent.setup();
    const { container } = render(<Shell view={SPIN_ONLY} name="Mug" load={loader({ spin })} />);
    expect(await seriousViolations(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "View in 3D" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled());
    expect(await seriousViolations(dialog)).toEqual([]);
  });
});

describe("which view goes with the pick", () => {
  const data = { view3d: { poster: "w" }, view3dByOption: { black: { poster: "b" }, red: { poster: "r" } } };
  it("uses the picked colour's view, else the whole item's", () => {
    expect(viewFor(data, { colour: "black", size: "m" }).poster).toBe("b");
    expect(viewFor(data, { colour: "blue" }).poster).toBe("w");
    expect(viewFor({ view3dByOption: { red: { poster: "r" } }, view3d: null }, { colour: "blue" })).toBeNull();
    expect(viewFor(null, {})).toBeNull();
  });
});
