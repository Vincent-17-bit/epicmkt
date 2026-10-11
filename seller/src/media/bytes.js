// Reading bytes from a Blob or File. Older engines (and jsdom) lack blob.arrayBuffer(), so fall back to FileReader.
export const bytesOf = (blob) =>
  blob.arrayBuffer
    ? blob.arrayBuffer().then((b) => new Uint8Array(b))
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(new Uint8Array(r.result));
        r.onerror = () => reject(r.error ?? new Error("read_failed"));
        r.readAsArrayBuffer(blob);
      });

export const headBytes = (blob, n = 64) => bytesOf(blob.slice(0, n));

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read_failed"));
    r.readAsDataURL(blob);
  });

export const concatBytes = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
