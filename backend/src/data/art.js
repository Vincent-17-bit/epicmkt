const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const tile = (hue, width, height, label, size) =>
  toUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 78%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360} 60% 58%)"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="${size}" fill="hsl(${hue} 55% 22%)">${escape(label)}</text></svg>`
  );

export const coverArt = (hue, name) => tile(hue, 1200, 600, name, 72);
export const logoArt = (hue, name) => tile(hue, 240, 240, initials(name), 96);
export const serviceArt = (hue, name) => tile(hue, 480, 360, name, 36);
export const galleryArt = (hue, caption) => tile(hue, 900, 675, caption, 56);
