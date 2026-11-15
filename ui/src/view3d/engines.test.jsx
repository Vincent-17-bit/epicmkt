import { afterEach, describe, expect, it, vi } from "vitest";
import { ZOOM, clampZoom } from "./contract.js";
import { createSpinEngine, dragToFrames, loadOrder, wrap } from "./spinEngine.js";
import { createModelEngine } from "./modelEngine.js";

// 24 test frames. The fake Image "loads" on the next tick, in the order asked for, so the test can see what was requested.
const requested = [];
class FakeImage {
  constructor() { this.complete = false; this.naturalWidth = 0; }
  set src(v) {
    this._src = v;
    if (v === "") return;
    requested.push(v);
    queueMicrotask(() => { this.complete = true; this.naturalWidth = 100; this.onload?.(); });
  }
  get src() { return this._src; }
}
const frames = Array.from({ length: 24 }, (_, i) => `https://img.test/f${String(i).padStart(2, "0")}.jpg`);
const box = () => { const el = document.createElement("div"); Object.defineProperty(el, "clientWidth", { value: 240 }); document.body.appendChild(el); return el; };
const pointer = (el, type, x, id = 1) => el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x }), { pointerId: id }));
const frameOf = (el) => Number(el.querySelector("[data-view3d]").getAttribute("data-frame"));

afterEach(() => { requested.length = 0; document.body.innerHTML = ""; });

describe("zoom", () => {
  it("is held between the limits", () => {
    expect(clampZoom(0.2)).toBe(ZOOM.min);
    expect(clampZoom(99)).toBe(ZOOM.max);
    expect(clampZoom("nope")).toBe(ZOOM.start);
    expect(clampZoom(2)).toBe(2);
  });
});

describe("photo spin", () => {
  it("loads the first frame first, then in a coarse-to-fine order, and each frame once", () => {
    const order = loadOrder(24);
    expect(order.slice(0, 4)).toEqual([0, 8, 16, 4]);
    expect(new Set(order).size).toBe(24);
  });

  it("maps a drag across the picture to one full turn, and wraps round", () => {
    expect(dragToFrames(240, 240, 24)).toBe(24);
    expect(dragToFrames(60, 240, 24)).toBe(6);
    expect(wrap(-1, 24)).toBe(23);
    expect(wrap(24, 24)).toBe(0);
    expect(wrap(25.4, 24)).toBe(1);
  });

  it("turns with the drag and wraps from the first frame to the last", async () => {
    const el = box();
    const e = createSpinEngine({ frames, ImageClass: FakeImage, raf: () => 0, caf: () => {} });
    await e.mount(el);
    expect(frameOf(el)).toBe(0);
    const stage = el.querySelector("[data-view3d]");
    pointer(stage, "pointerdown", 100);
    pointer(stage, "pointermove", 40); // 60 px left of 240 px = a quarter turn forward = 6 frames
    expect(frameOf(el)).toBe(6);
    pointer(stage, "pointerup", 40);
    e.rotateBy(-7); // back past the start wraps to the end
    expect(frameOf(el)).toBe(23);
    e.destroy();
  });

  it("zooms within limits by wheel and by setZoom, and reports it", async () => {
    const el = box();
    const e = createSpinEngine({ frames, ImageClass: FakeImage, raf: () => 0, caf: () => {} });
    await e.mount(el);
    expect(e.setZoom(10)).toBe(ZOOM.max);
    expect(e.setZoom(-3)).toBe(ZOOM.min);
    const stage = el.querySelector("[data-view3d]");
    stage.dispatchEvent(Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), { deltaY: -100 }));
    expect(e.getState().zoom).toBe(ZOOM.min + ZOOM.step);
    expect(el.querySelector("img").style.transform).toBe(`scale(${ZOOM.min + ZOOM.step})`);
    e.destroy();
  });

  it("auto-orbits when asked and stops when told", async () => {
    const el = box();
    const ticks = [];
    const e = createSpinEngine({ frames, ImageClass: FakeImage, raf: (fn) => { ticks.push(fn); return ticks.length; }, caf: () => {} });
    await e.mount(el);
    e.setAutoRotate(true);
    for (let i = 0; i < 10; i += 1) ticks.shift()?.();
    expect(frameOf(el)).toBe(2);
    e.setAutoRotate(false);
    ticks.shift()?.();
    expect(ticks).toHaveLength(0);
    e.destroy();
  });

  it("lets go of every image and the page element on destroy, and is safe twice", async () => {
    const el = box();
    const images = [];
    class Tracked extends FakeImage { constructor() { super(); images.push(this); } }
    const e = createSpinEngine({ frames, ImageClass: Tracked, raf: () => 0, caf: () => {} });
    await e.mount(el);
    await Promise.resolve();
    e.destroy();
    e.destroy();
    expect(el.children).toHaveLength(0);
    expect(images.every((i) => i.src === "" && i.onload === null)).toBe(true);
  });

  it("refuses to mount with no frames, so the shell can fall back", async () => {
    await expect(createSpinEngine({ frames: [], ImageClass: FakeImage }).mount(box())).rejects.toThrow("spin_unavailable");
  });
});

describe("model", () => {
  const make = (over = {}) => {
    const log = { disposed: [], controlsDisposed: 0, rendererDisposed: 0, lost: 0, rendered: 0 };
    const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return vec(this.x, this.y, this.z); }, sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }, add(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }, length() { return Math.hypot(this.x, this.y, this.z); }, set(x2, y2, z2) { this.x = x2; this.y = y2; this.z = z2; return this; }, normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }, multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }, applyAxisAngle() { return this; } });
    const mesh = { geometry: { dispose: () => log.disposed.push("geometry") }, material: { map: { isTexture: true, dispose: () => log.disposed.push("texture") }, dispose: () => log.disposed.push("material") } };
    const root = { traverse: (fn) => fn(mesh), position: vec() };
    const THREE = {
      WebGLRenderer: class { constructor() { if (over.noWebgl) throw new Error("no webgl"); this.domElement = document.createElement("canvas"); } setPixelRatio() {} setSize() {} render() { log.rendered += 1; } dispose() { log.rendererDisposed += 1; } forceContextLoss() { log.lost += 1; } },
      Scene: class { constructor() { this.kids = []; } add(o) { this.kids.push(o); } traverse(fn) { this.kids.forEach((k) => k.traverse?.(fn)); } },
      HemisphereLight: class {}, DirectionalLight: class { constructor() { this.position = vec(); } },
      PerspectiveCamera: class { constructor(fov) { this.fov = fov; this.position = vec(); } updateProjectionMatrix() {} },
      Box3: class { setFromObject() { return this; } getSize(v) { return v.set(2, 1, 1); } getCenter(v) { return v.set(0, 0, 0); } },
      Vector3: class { constructor(x = 0, y = 0, z = 0) { return vec(x, y, z); } }
    };
    class GLTFLoader { load(url, ok, _p, fail) { if (over.badModel) fail(new Error("x")); else ok({ scene: root }); } }
    class OrbitControls { constructor() { this.target = vec(); this.autoRotate = false; } update() {} dispose() { log.controlsDisposed += 1; } }
    return { log, libs: { THREE, GLTFLoader, OrbitControls } };
  };

  it("mounts, keeps zoom within limits and toggles auto-rotate", async () => {
    const { libs } = make();
    const el = box();
    const e = createModelEngine({ url: "https://m.test/a.glb", libs, raf: () => 1, caf: () => {} });
    await e.mount(el);
    expect(el.querySelector("canvas[data-view3d=model]")).not.toBeNull();
    expect(e.setZoom(99)).toBe(ZOOM.max);
    expect(e.setZoom(0)).toBe(ZOOM.min);
    e.setAutoRotate(true);
    expect(e.getState()).toMatchObject({ autoRotate: true, ready: true });
    e.destroy();
  });

  it("takes a still picture of the viewer once it is ready, and none before or after", async () => {
    const { libs } = make();
    const el = box();
    const e = createModelEngine({ url: "x.glb", libs, raf: () => 1, caf: () => {} });
    expect(await e.capture()).toBeNull();
    await e.mount(el);
    const canvas = el.querySelector("canvas");
    canvas.toBlob = vi.fn((cb, type) => cb(new Blob(["x"], { type })));
    const blob = await e.capture();
    expect(blob).toBeInstanceOf(Blob);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", 0.92);
    e.destroy();
    expect(await e.capture()).toBeNull();
  });

  it("disposes geometry, textures, materials, controls and the renderer on destroy", async () => {
    const { libs, log } = make();
    const el = box();
    const e = createModelEngine({ url: "x.glb", libs, raf: () => 1, caf: () => {} });
    await e.mount(el);
    e.destroy();
    e.destroy();
    expect(log.disposed.sort()).toEqual(["geometry", "material", "texture"]);
    expect([log.controlsDisposed, log.rendererDisposed, log.lost]).toEqual([1, 1, 1]);
    expect(el.querySelector("canvas")).toBeNull();
  });

  it("reports WebGL as unavailable, and a model that will not load, so the shell can fall back", async () => {
    await expect(createModelEngine({ url: "x", libs: make({ noWebgl: true }).libs }).mount(box())).rejects.toThrow("webgl_unavailable");
    await expect(createModelEngine({ url: "x", libs: make({ badModel: true }).libs }).mount(box())).rejects.toThrow("model_load_failed");
  });
});
