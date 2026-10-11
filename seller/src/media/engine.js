import { blobToDataUrl } from "./bytes.js";

// The browser side of the pipeline: decode, re-encode through a canvas, read a video, grab a frame.
// Everything that touches the DOM is here, so the rules in prepare.js can be tested with a stand-in engine.
//
// Re-encoding through a canvas is what removes EXIF, GPS and colour-profile data (a canvas only holds pixels) and
// applies the camera's rotation, so a sideways phone photo is stored upright.

let webpEncode;
const canEncodeWebp = () => {
  if (webpEncode !== undefined) return webpEncode;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webpEncode = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpEncode = false;
  }
  return webpEncode;
};

const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const toBlob = (canvas, type, quality) =>
  canvas.convertToBlob
    ? canvas.convertToBlob({ type, quality })
    : new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), type, quality));

const paint = (canvas, source, w, h, flatten) => {
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  if (flatten) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
  g.drawImage(source, 0, 0, w, h);
  return canvas;
};

// Halve repeatedly while the target is much smaller, then take the last step. One big jump aliases badly.
function scaled(source, sw, sh, tw, th, flatten) {
  let cur = source;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw) {
    const nw = Math.max(tw, Math.floor(cw / 2));
    const nh = Math.max(1, Math.floor(ch / 2));
    cur = paint(makeCanvas(nw, nh), cur, nw, nh, flatten);
    cw = nw;
    ch = nh;
  }
  return paint(makeCanvas(tw, th), cur, tw, th, flatten);
}

const wait = (target, ok, bad, ms, what) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`${what}_timeout`)); }, ms);
    const done = (fn, v) => () => { off(); fn(v); };
    const onOk = done(resolve);
    const onBad = done(reject, new Error(`${what}_failed`));
    function off() {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      if (bad) target.removeEventListener(bad, onBad);
    }
    target.addEventListener(ok, onOk, { once: true });
    if (bad) target.addEventListener(bad, onBad, { once: true });
  });

export const browserEngine = {
  canPlayType: (mime) => document.createElement("video").canPlayType(mime),

  async decodeImage(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (!bitmap.width || !bitmap.height) throw new Error("decode_failed");
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("decode_failed");
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
      } catch {
        URL.revokeObjectURL(url);
        throw new Error("decode_failed");
      }
    }
  },

  // One WebP at a width (JPEG where the browser cannot write WebP). Never carries metadata over.
  async encode(decoded, { width, quality = 0.82 }) {
    const height = Math.max(1, Math.round((decoded.height * width) / decoded.width));
    let type = canEncodeWebp() ? "image/webp" : "image/jpeg";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const canvas = scaled(decoded.source, decoded.width, decoded.height, width, height, type === "image/jpeg");
      const blob = await toBlob(canvas, type, quality);
      if (blob.type === type) return { blob, width, height, type, ext: type === "image/webp" ? "webp" : "jpg" };
      type = "image/jpeg";
    }
    throw new Error("encode_failed");
  },

  // A few pixels wide. Shown blurred while the real photo loads.
  async placeholder(decoded) {
    const width = 16;
    const height = Math.max(1, Math.round((decoded.height * width) / decoded.width));
    const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
    const blob = await toBlob(scaled(decoded.source, decoded.width, decoded.height, width, height, type === "image/jpeg"), type, 0.4);
    return blobToDataUrl(blob);
  },

  // Reads duration and size from the file. `url` is an object URL the caller must release with dispose().
  async probeVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const dispose = () => { video.removeAttribute("src"); video.load?.(); URL.revokeObjectURL(url); };
    try {
      const ready = wait(video, "loadedmetadata", "error", 12000, "video");
      video.src = url;
      await ready;
      if (!Number.isFinite(video.duration)) {
        // Recorded WebM often reports Infinity until the end is reached once.
        const settled = wait(video, "durationchange", null, 4000, "video").catch(() => {});
        video.currentTime = 1e6;
        await settled;
        video.currentTime = 0;
      }
      return { video, url, duration: video.duration, width: video.videoWidth, height: video.videoHeight, dispose };
    } catch (e) {
      dispose();
      throw e;
    }
  },

  // The frame at timeSec as an image. `source` is a probe from probeVideo, or { url } of a video already stored.
  async captureFrame(source, timeSec, { maxWidth = 960, quality = 0.82 } = {}) {
    let video = source.video;
    let own = null;
    if (!video) {
      own = document.createElement("video");
      own.crossOrigin = "anonymous";
      own.muted = true;
      own.playsInline = true;
      own.preload = "auto";
      const ready = wait(own, "loadeddata", "error", 15000, "video");
      own.src = source.url;
      await ready;
      video = own;
    }
    try {
      const target = Math.max(0, Math.min(timeSec, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : timeSec));
      if (Math.abs(video.currentTime - target) > 0.01 || video.readyState < 2) {
        const seeked = wait(video, "seeked", "error", 10000, "seek");
        video.currentTime = target;
        await seeked;
      }
      const sw = video.videoWidth;
      const sh = video.videoHeight;
      if (!sw || !sh) throw new Error("no_frame");
      const width = Math.min(maxWidth, sw);
      const height = Math.max(1, Math.round((sh * width) / sw));
      let type = canEncodeWebp() ? "image/webp" : "image/jpeg";
      let blob = await toBlob(scaled(video, sw, sh, width, height, type === "image/jpeg"), type, quality);
      if (blob.type !== type) {
        type = "image/jpeg";
        blob = await toBlob(scaled(video, sw, sh, width, height, true), type, quality);
      }
      return { blob, width, height, type, ext: type === "image/webp" ? "webp" : "jpg", timeSec: target };
    } finally {
      if (own) { own.removeAttribute("src"); own.load?.(); }
    }
  },
};

let current = browserEngine;
export const getMediaEngine = () => current;
// Tests swap in a stand-in. Pass nothing to go back to the browser.
export const setMediaEngine = (engine) => { current = engine ?? browserEngine; };
