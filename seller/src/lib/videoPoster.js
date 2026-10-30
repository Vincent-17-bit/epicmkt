const POSTER_WIDTH = 480;

const fail = (code) => Object.assign(new Error(code), { code });

const drawPoster = (video) =>
  new Promise((resolve) => {
    try {
      const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((video.videoWidth || POSTER_WIDTH) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || POSTER_WIDTH * 0.5625) * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.8);
    } catch {
      resolve(null);
    }
  });

const open = (src, { crossOrigin, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    if (crossOrigin) video.crossOrigin = "anonymous";
    const timer = setTimeout(() => done(fail("video_unplayable")), timeoutMs);
    const done = (err) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      err ? reject(err) : resolve(video);
    };
    video.onloadedmetadata = () => done(null);
    video.onerror = () => done(fail("video_unplayable"));
    video.src = src;
  });

const frameAt = (video) =>
  new Promise((resolve) => {
    const at = Math.min(0.5, (video.duration || 0) / 2);
    const timer = setTimeout(() => resolve(), 4000);
    video.onseeked = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      video.currentTime = at;
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });

const release = (video) => {
  video.removeAttribute("src");
  video.load?.();
};

export async function readVideo(file, { timeoutMs = 8000 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const video = await open(url, { timeoutMs });
    const durationSec = Number.isFinite(video.duration) ? video.duration : null;
    if (durationSec === null) throw fail("video_unplayable");
    await frameAt(video);
    const poster = await drawPoster(video);
    const info = { durationSec, width: video.videoWidth || null, height: video.videoHeight || null, poster };
    release(video);
    return info;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function posterFromUrl(url, { timeoutMs = 8000 } = {}) {
  try {
    const video = await open(url, { crossOrigin: true, timeoutMs });
    await frameAt(video);
    const poster = await drawPoster(video);
    release(video);
    return poster;
  } catch {
    return null;
  }
}
