import { ROTATE_DEGREES, ZOOM, clampZoom } from "./contract.js";

// .glb model (C16). The 3D library is loaded here, inside mount(), by dynamic import, so a page that never opens the viewer
// never downloads it. `libs` lets a test (or a build that bundles differently) hand the library in.
export const loadThree = async () => {
  const [THREE, loaderModule, controlsModule] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/controls/OrbitControls.js")
  ]);
  return { THREE, GLTFLoader: loaderModule.GLTFLoader, OrbitControls: controlsModule.OrbitControls };
};

const disposeMaterial = (m) => {
  if (!m) return;
  for (const value of Object.values(m)) if (value && typeof value.dispose === "function" && value.isTexture) value.dispose();
  m.dispose?.();
};

export function createModelEngine({ url, libs, raf, caf } = {}) {
  const request = raf ?? ((fn) => requestAnimationFrame(fn));
  const cancel = caf ?? ((id) => cancelAnimationFrame(id));
  let zoom = ZOOM.start;
  let auto = false;
  let ready = false;
  let destroyed = false;
  let frame = null;
  let three = null;
  let renderer = null;
  let controls = null;
  let camera = null;
  let scene = null;
  let observer = null;
  let canvas = null;
  let baseDistance = 3;
  let target = null;

  const place = () => {
    if (!camera || !controls) return;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.length() === 0) dir.set(0, 0, 1);
    camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(baseDistance / zoom));
    controls.update?.();
  };
  const loop = () => {
    frame = null;
    if (destroyed || !renderer) return;
    controls?.update?.();
    renderer.render(scene, camera);
    frame = request(loop);
  };
  const resize = (container) => {
    if (!renderer || !camera) return;
    const w = Math.max(1, container.clientWidth || 300);
    const h = Math.max(1, container.clientHeight || 300);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const engine = {
    async mount(container, { onProgress } = {}) {
      if (destroyed) throw new Error("destroyed");
      const lib = libs ?? (await loadThree());
      if (destroyed) return;
      const { THREE, GLTFLoader, OrbitControls } = lib;
      three = THREE;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        throw new Error("webgl_unavailable");
      }
      canvas = renderer.domElement;
      canvas.setAttribute("data-view3d", "model");
      canvas.style.cssText = "inline-size:100%;block-size:100%;display:block;touch-action:none;cursor:grab";
      container.appendChild(canvas);
      renderer.setPixelRatio?.(Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);

      const gltf = await new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, (e) => { if (e?.lengthComputable && e.total) onProgress?.(e.loaded / e.total); }, () => reject(new Error("model_load_failed"))));
      if (destroyed) { disposeScene(gltf.scene); return; }
      const model = gltf.scene;
      scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const radius = Math.max(size.x, size.y, size.z, 0.001) / 2;
      baseDistance = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.15;
      camera.position.set(baseDistance * 0.6, baseDistance * 0.35, baseDistance);
      camera.near = baseDistance / 100;
      camera.far = baseDistance * 100;
      target = new THREE.Vector3(0, 0, 0);

      controls = new OrbitControls(camera, canvas);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false; // zoom goes through setZoom so the shell's buttons and the wheel agree
      controls.autoRotate = auto;
      controls.autoRotateSpeed = 1.5;
      canvas.addEventListener("wheel", onWheel, { passive: false });
      resize(container);
      if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(() => resize(container)); observer.observe(container); }
      place();
      ready = true;
      frame = request(loop);
    },
    setZoom(z) { zoom = clampZoom(z); place(); return zoom; },
    rotateBy(steps) {
      if (!camera || !controls || !three) return;
      const angle = (-steps * ROTATE_DEGREES * Math.PI) / 180;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new three.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update?.();
    },
    setAutoRotate(on) { auto = Boolean(on); if (controls) controls.autoRotate = auto; },
    getState: () => ({ zoom, autoRotate: auto, ready }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancel(frame);
      frame = null;
      observer?.disconnect?.();
      canvas?.removeEventListener?.("wheel", onWheel);
      controls?.dispose?.();
      disposeScene(scene);
      renderer?.dispose?.();
      renderer?.forceContextLoss?.();
      canvas?.remove?.();
      renderer = controls = camera = scene = canvas = observer = null;
    }
  };

  function onWheel(e) { e.preventDefault?.(); engine.setZoom(zoom + (e.deltaY < 0 ? ZOOM.step : -ZOOM.step)); }
  function disposeScene(root) {
    root?.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
      else disposeMaterial(o.material);
    });
  }
  return engine;
}
