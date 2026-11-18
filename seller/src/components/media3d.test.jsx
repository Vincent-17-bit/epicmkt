import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import * as api from "../api/index.js";
import * as mock from "../api/mock.js";
import ModelUpload, { checkModelFile } from "./ModelUpload.jsx";
import SpinBuilder from "./SpinBuilder.jsx";
import Media3dSection from "../pages/business/catalog/editor/steps/Media3dSection.jsx";
import { frameIssues, move, sortFrames, startAt } from "../lib/spinPrep.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const serious = async (node) => (await axe(node)).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id);

// A tiny but valid binary glTF: header, one JSON chunk.
const glbBytes = (extra = {}) => {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, ...extra }).padEnd(48, " "));
  const out = new Uint8Array(20 + json.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, out.length, true); v.setUint32(12, json.length, true); v.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  return out;
};
const glb = (name = "mug.glb", extra) => new File([glbBytes(extra)], name, { type: "model/gltf-binary" });
const pic = (name) => new File([new Uint8Array(200)], name, { type: "image/jpeg" });
const previewLoad = vi.fn(async () => ({ mount: vi.fn(async () => {}), setAutoRotate: vi.fn(), destroy: vi.fn() }));

let ITEM;
beforeEach(async () => {
  mock.resetMock();
  await api.login("ES100001", "Demo-Passw0rd");
  ITEM = (await api.getCatalog()).items[0].id;
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  previewLoad.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const withClient = (ui) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

describe("checking a model file", () => {
  it("accepts a real .glb", async () => expect(await checkModelFile(glb())).toBe(""));
  it("refuses another file type", async () => expect(await checkModelFile(new File(["x"], "mug.png", { type: "image/png" }))).toMatch(/not a \.glb/));
  it("refuses a file over 15 MB without reading it", async () => {
    const big = glb();
    Object.defineProperty(big, "size", { value: 16 * 1024 * 1024 });
    expect(await checkModelFile(big)).toMatch(/over 15 MB/);
  });
  it("refuses a .glb that is not a glTF, and one that points at other sites", async () => {
    expect(await checkModelFile(new File([new Uint8Array(64)], "x.glb"))).toMatch(/not a \.glb/);
    expect(await checkModelFile(glb("x.glb", { buffers: [{ uri: "https://evil.test/a.bin", byteLength: 1 }] }))).toMatch(/stored elsewhere/);
  });
});

describe("model upload", () => {
  it("refuses a wrong type and shows why", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ModelUpload itemId={ITEM} onChanged={() => {}} previewLoad={previewLoad} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), new File(["x"], "mug.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a .glb");
    expect(screen.getByRole("button", { name: "Upload the model" })).toBeDisabled();
  });

  it("shows a preview, asks for a poster, then uploads both", async () => {
    const spy = vi.spyOn(mock, "uploadMedia3d");
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<ModelUpload itemId={ITEM} onChanged={changed} previewLoad={previewLoad} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), glb());
    await waitFor(() => expect(previewLoad).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "" })).toBeDefined();
    expect(screen.getByText("Choose a poster picture to go with this model.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload the model" })).toBeDisabled();
    await user.upload(screen.getByLabelText("Poster picture"), pic("poster.jpg"));
    await user.click(screen.getByRole("button", { name: "Upload the model" }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(spy.mock.calls.map((c) => c[1].role)).toEqual(["model-glb", "poster"]);
    expect((await api.getItemMedia3d(ITEM)).hasView).toBe(true);
  });

  it("replaces and removes an uploaded model", async () => {
    await api.uploadMedia3d(ITEM, { role: "model-glb", file: glb() });
    await api.uploadMedia3d(ITEM, { role: "poster", file: pic("p.jpg") });
    const before = await api.getItemMedia3d(ITEM);
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<ModelUpload itemId={ITEM} model={before.media3d.find((r) => r.role === "model-glb")} poster={before.media3d.find((r) => r.role === "poster")} onChanged={changed} previewLoad={previewLoad} />);
    expect(screen.getByText(/A model is uploaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove the model" }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect((await api.getItemMedia3d(ITEM)).media3d).toEqual([]);
  });

  it("has no serious accessibility violations", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModelUpload itemId={ITEM} onChanged={() => {}} previewLoad={previewLoad} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), glb());
    await screen.findByText("Choose a poster picture to go with this model.");
    expect(await serious(container)).toEqual([]);
  });
});

describe("spin helpers", () => {
  it("orders camera names naturally", () => {
    expect(sortFrames([pic("IMG_10.jpg"), pic("IMG_2.jpg"), pic("IMG_1.jpg")]).map((f) => f.name)).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"]);
  });
  it("limits the count to 12-72", () => {
    expect(frameIssues(11)).toEqual(["too_few"]);
    expect(frameIssues(12)).toEqual([]);
    expect(frameIssues(72)).toEqual([]);
    expect(frameIssues(73)).toEqual(["too_many"]);
  });
  it("moves a frame and sets the start frame", () => {
    expect(move([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(move([1, 2], 0, -1)).toEqual([1, 2]);
    expect(startAt([1, 2, 3, 4], 2)).toEqual([3, 4, 1, 2]);
  });
});

describe("spin builder", () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `IMG_${i + 1}.jpg`);
  const shuffled = (n) => { const list = names(n); return [...list.slice(5), ...list.slice(0, 5)].map(pic); };
  const compress = vi.fn(async (f) => f);

  it("puts 24 pictures in order and counts them", async () => {
    const user = userEvent.setup();
    render(<SpinBuilder itemId={ITEM} onChanged={() => {}} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), shuffled(24));
    expect(await screen.findByText("24 of 12 to 72 pictures")).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "Pictures in order" });
    const first = within(strip).getAllByRole("button", { name: /^Show picture/ });
    expect(first[0]).toHaveAccessibleName("Show picture 1, IMG_1.jpg");
    expect(first[23]).toHaveAccessibleName("Show picture 24, IMG_24.jpg");
    expect(screen.getByRole("button", { name: /Upload 24 pictures/ })).toBeEnabled();
  });

  it("will not upload fewer than 12, and leaves out pictures past 72 and files that are not pictures", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<SpinBuilder itemId={ITEM} onChanged={() => {}} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), names(5).map(pic));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least 12 pictures");
    expect(screen.getByRole("button", { name: /Upload 5 pictures/ })).toBeDisabled();
    await user.upload(screen.getByLabelText("Spin pictures"), [...names(80).slice(5).map(pic), new File(["x"], "notes.pdf", { type: "application/pdf" })]);
    expect(await screen.findByText(/left out: a spin has at most 72/)).toBeInTheDocument();
    expect(screen.getByText(/1 file was left out/)).toBeInTheDocument();
    expect(screen.getByText("72 of 12 to 72 pictures")).toBeInTheDocument();
  });

  it("moves a picture, sets the start frame and previews the turn", async () => {
    const user = userEvent.setup();
    render(<SpinBuilder itemId={ITEM} onChanged={() => {}} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), names(12).map(pic));
    await user.click(await screen.findByRole("button", { name: "Move picture 1 later" }));
    expect(screen.getAllByRole("button", { name: /^Show picture/ })[0]).toHaveAccessibleName("Show picture 1, IMG_2.jpg");
    const slider = screen.getByRole("slider");
    await user.click(screen.getByRole("button", { name: "Show picture 4, IMG_4.jpg" }));
    expect(slider).toHaveValue("3");
    await user.click(screen.getByRole("button", { name: "Make picture 4 the start" }));
    expect(screen.getAllByRole("button", { name: /^Show picture/ })[0]).toHaveAccessibleName("Show picture 1, IMG_4.jpg");
    expect(screen.getByAltText("Picture 1 of 12")).toBeInTheDocument();
  });

  it("uploads every frame in order, and the first as the poster", async () => {
    const spy = vi.spyOn(mock, "uploadMedia3d");
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<SpinBuilder itemId={ITEM} onChanged={changed} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), shuffled(12));
    await user.click(await screen.findByRole("button", { name: /Upload 12 pictures/ }));
    await waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 8000 });
    const calls = spy.mock.calls.map((c) => [c[1].role, c[1].position]);
    expect(calls.filter(([r]) => r === "spin-frame").map(([, p]) => p)).toEqual([...Array(12).keys()]);
    expect(calls.filter(([r]) => r === "poster")).toHaveLength(1);
    const state = await api.getItemMedia3d(ITEM);
    expect(state.hasView).toBe(true);
    expect(state.issues).toEqual([]);
  });

  it("has no serious accessibility violations with pictures chosen", async () => {
    const user = userEvent.setup();
    const { container } = render(<SpinBuilder itemId={ITEM} onChanged={() => {}} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), names(12).map(pic));
    await screen.findByText("12 of 12 to 72 pictures");
    expect(await serious(container)).toEqual([]);
  });
});

describe("the 3D section of the editor", () => {
  it("asks to save a new item first", () => {
    render(withClient(<Media3dSection itemId={null} />));
    expect(screen.getByText(/Save the item first/)).toBeInTheDocument();
  });
  it("offers the item's option values as the place a 3D view belongs", async () => {
    const options = { axes: [{ key: "colour", label: "Colour", values: [{ id: "black", label: "Black" }, { id: "red", label: "Red" }] }] };
    render(withClient(<Media3dSection itemId={ITEM} options={options} />));
    const select = await screen.findByLabelText("This 3D view is for");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["The whole item", "Colour: Black", "Colour: Red"]);
  });
  it("tells the seller what a view is missing", async () => {
    await api.uploadMedia3d(ITEM, { role: "model-glb", file: glb() });
    render(withClient(<Media3dSection itemId={ITEM} />));
    expect(await screen.findByText("Add a poster picture, or this 3D view will not be shown.", {}, { timeout: 12000 })).toBeInTheDocument();
  }, 20000);
});

describe("poster taken from the model", () => {
  const makeLoad = (capture) => vi.fn(async () => ({ mount: vi.fn(async () => {}), setAutoRotate: vi.fn(), destroy: vi.fn(), capture }));
  const glb = () => {
    const bytes = new Uint8Array(20);
    bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
    return new File([bytes], "chair.glb", { type: "model/gltf-binary" });
  };

  it("makes the poster from the preview on its own, and the seller can take a new one", async () => {
    const capture = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
    const load = makeLoad(capture);
    const user = userEvent.setup({ applyAccept: false });
    vi.spyOn(await import("@epicmkt/shared"), "inspectGlb").mockReturnValue({ ok: true });
    render(<ModelUpload itemId={ITEM} onChanged={() => {}} previewLoad={load} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), glb());
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(await screen.findByAltText("Poster picture")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Take a new poster from the preview" }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
  });

  it("says so, and keeps the choose-a-picture way, when the picture cannot be taken", async () => {
    const load = makeLoad(vi.fn(async () => null));
    const user = userEvent.setup({ applyAccept: false });
    vi.spyOn(await import("@epicmkt/shared"), "inspectGlb").mockReturnValue({ ok: true });
    render(<ModelUpload itemId={ITEM} onChanged={() => {}} previewLoad={load} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), glb());
    await user.click(await screen.findByRole("button", { name: "Make the poster from the preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Choose a poster picture instead/);
    expect(screen.getByLabelText("Poster picture")).toBeInTheDocument();
  });
});

describe("deleting single 3D files", () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `IMG_${i + 1}.jpg`);
  const compress = vi.fn(async (f) => f);
  const framesOf = async () => (await api.getItemMedia3d(ITEM)).media3d.filter((r) => r.role === "spin-frame").sort((a, b) => a.sort - b.sort);

  it("a poster on its own cannot be sent as 'the model'", async () => {
    const user = userEvent.setup();
    render(<ModelUpload itemId={ITEM} onChanged={() => {}} previewLoad={previewLoad} />);
    await user.upload(screen.getByLabelText("Poster picture"), pic("poster.jpg"));
    expect(screen.getByRole("button", { name: "Upload the model" })).toBeDisabled();
    expect(screen.getByText("Now choose the .glb model this poster belongs to.")).toBeInTheDocument();
  });

  it("removes a chosen model file before it is sent, and deletes the uploaded poster on its own", async () => {
    await api.uploadMedia3d(ITEM, { role: "model-glb", file: glb() });
    await api.uploadMedia3d(ITEM, { role: "poster", file: pic("p.jpg") });
    const rows = (await api.getItemMedia3d(ITEM)).media3d;
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<ModelUpload itemId={ITEM} model={rows.find((r) => r.role === "model-glb")} poster={rows.find((r) => r.role === "poster")} onChanged={changed} previewLoad={previewLoad} />);
    await user.upload(screen.getByLabelText("Model file (.glb)"), glb("other.glb"));
    await user.click(await screen.findByRole("button", { name: "Remove other.glb" }));
    expect(screen.queryByText(/other\.glb/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete the poster" }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect((await api.getItemMedia3d(ITEM)).media3d.map((r) => r.role)).toEqual(["model-glb"]);
  });

  it("deletes one uploaded spin picture, moves one, and adds more to an existing spin", async () => {
    for (let i = 0; i < 13; i++) await api.uploadMedia3d(ITEM, { role: "spin-frame", file: pic(`f${i}.jpg`), position: i });
    await api.uploadMedia3d(ITEM, { role: "poster", file: pic("p.jpg") });
    const before = await framesOf();
    const changed = vi.fn();
    const user = userEvent.setup();
    const view = render(<SpinBuilder itemId={ITEM} frames={before} poster={{ path: "p" }} onChanged={changed} compress={compress} />);
    expect(screen.getByText(/13 pictures are uploaded/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete picture 2" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect((await framesOf()).map((f) => f.path)).toEqual(before.filter((_, i) => i !== 1).map((f) => f.path));

    const now = await framesOf();
    view.rerender(<SpinBuilder itemId={ITEM} frames={now} poster={{ path: "p" }} onChanged={changed} compress={compress} />);
    await user.click(screen.getByRole("button", { name: "Move picture 1 later" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    expect((await framesOf()).slice(0, 2).map((f) => f.path)).toEqual([now[1].path, now[0].path]);

    const spy = vi.spyOn(mock, "uploadMedia3d");
    view.rerender(<SpinBuilder itemId={ITEM} frames={await framesOf()} poster={{ path: "p" }} onChanged={changed} compress={compress} />);
    await user.upload(screen.getByLabelText("Spin pictures"), names(2).map(pic));
    await user.click(await screen.findByRole("button", { name: "Upload 2 more pictures" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls.map((c) => c[1].position)).toEqual([12, 13]);
    expect(spy.mock.calls.every((c) => c[1].role === "spin-frame")).toBe(true);
  });
});
