import { PDF_MAX_ITEMS, formatInstant, groupBySection, imageUrl, pdfSafe, sharePrice, shopDisplayUrl } from "@epicmkt/shared";
import { loadImage, saveBlob } from "./poster.js";
import { qrDataUrl } from "./qrImage.js";

export const PAGE = { w: 210, h: 297, margin: 14 };
const COLS = 3;
const GAP = 5;
const CARD_W = (PAGE.w - PAGE.margin * 2 - GAP * (COLS - 1)) / COLS;
const TOP = 22;
const BOTTOM = PAGE.h - 18;
const HEADING_H = 11;
const NAVY = [11, 37, 69];
const SKY = [56, 182, 255];
const INK = [17, 17, 17];
const MUTED = [90, 98, 110];
const SOFT = [238, 242, 247];
const PHOTO_PX = 420;
const PARALLEL = 6;

const cardHeight = (prices) => CARD_W + (prices ? 21 : 15);

/** How many cards fit on a page below a section heading, and the rows on a page. Exposed so the layout can be tested. */
export const rowsPerPage = (prices) => Math.floor((BOTTOM - TOP + GAP) / (cardHeight(prices) + GAP));

/** Where each group's heading and cards go: [{ page, kind: "heading"|"card", x, y, ... }]. Pure, so it is tested without a PDF. */
export function layoutCatalogue(groups, { prices = true } = {}) {
  const out = [];
  const h = cardHeight(prices);
  let page = 0;
  let y = TOP;
  for (const group of groups) {
    if (y + HEADING_H + h > BOTTOM) { page += 1; y = TOP; }
    if (group.title) { out.push({ page, kind: "heading", y, title: group.title }); y += HEADING_H; }
    let col = 0;
    for (const item of group.items) {
      if (col === 0 && y + h > BOTTOM) { page += 1; y = TOP; if (group.title) { out.push({ page, kind: "heading", y, title: `${group.title} (continued)` }); y += HEADING_H; } }
      out.push({ page, kind: "card", x: PAGE.margin + col * (CARD_W + GAP), y, item });
      col += 1;
      if (col === COLS) { col = 0; y += h + GAP; }
    }
    if (col !== 0) y += h + GAP;
    y += 2;
  }
  return { cells: out, pages: page + 1 };
}

// A square, cropped, small JPEG so a catalogue of many photos stays a few MB.
async function photoData(url) {
  const img = await loadImage(url);
  if (!img) return null;
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_PX;
  canvas.height = PHOTO_PX;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function loadPhotos(items, onProgress) {
  const out = new Map();
  let done = 0;
  const queue = items.filter((i) => i.imageUrl);
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      out.set(i.id, await photoData(i.imageUrl).catch(() => null));
      done += 1;
      onProgress?.(done, done + queue.length);
    }
  };
  const total = queue.length;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
  return out;
}

const dateText = (now) => formatInstant(now, { day: "numeric", month: "long", year: "numeric" });

/** Builds the catalogue PDF and returns it as a Blob. `shop`: { name, slug, planKey, logoUrl }. Items: catalogue items (see shareableItems).
 *  Photos that cannot be loaded are replaced by the item's first letter; the PDF is still made. */
export async function buildCataloguePdf({ shop, items, prices = true, site, now = new Date(), onProgress, cloudName, supabaseUrl }) {
  const list = items.slice(0, PDF_MAX_ITEMS).map((i) => ({ ...i, imageUrl: imageUrl(i.imagePaths?.[0], { cloudName, supabaseUrl, width: 480 }) }));
  const [{ jsPDF }, photos, qr, logo] = await Promise.all([
    import("jspdf"),
    loadPhotos(list, onProgress),
    qrDataUrl(shop.slug, { planKey: shop.planKey, hasLogo: false, site }).catch(() => null),
    shop.logoUrl ? photoData(shop.logoUrl).catch(() => null) : Promise.resolve(null)
  ]);

  const name = pdfSafe(shop.name) || "Our shop";
  const link = shopDisplayUrl(shop.slug, site);
  const { cells, pages } = layoutCatalogue(groupBySection(list), { prices });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `${name} catalogue`, subject: "Catalogue", creator: "EpicMKT" });

  // Cover
  doc.setFillColor(...SKY);
  doc.rect(0, 0, PAGE.w, 150, "F");
  doc.setFillColor(...NAVY);
  doc.rect(0, 150, PAGE.w, 4, "F");
  let textY = 62;
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(PAGE.margin, 32, 30, 30, 4, 4, "F");
    doc.addImage(logo, "JPEG", PAGE.margin + 1.5, 33.5, 27, 27, undefined, "FAST");
    textY = 78;
  }
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.setFontSize(34);
  const titleLines = doc.splitTextToSize(name, PAGE.w - PAGE.margin * 2).slice(0, 3);
  doc.text(titleLines, PAGE.margin, textY + 12);
  const after = textY + 12 + titleLines.length * 13;
  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text(`Catalogue  |  ${dateText(now)}`, PAGE.margin, after + 4);
  doc.setFontSize(12);
  doc.text(`${list.length} ${list.length === 1 ? "item" : "items"}`, PAGE.margin, after + 12);
  if (qr) doc.addImage(qr, "PNG", PAGE.margin, 176, 56, 56);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Scan to see prices, photos and location", PAGE.margin + 64, 192, { maxWidth: PAGE.w - PAGE.margin * 2 - 64 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  doc.text(link, PAGE.margin + 64, 206, { maxWidth: PAGE.w - PAGE.margin * 2 - 64 });
  if (items.length > PDF_MAX_ITEMS) doc.text(`Showing the first ${PDF_MAX_ITEMS} of ${items.length} items.`, PAGE.margin + 64, 216, { maxWidth: PAGE.w - PAGE.margin * 2 - 64 });

  // Pages
  for (let p = 0; p < pages; p += 1) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(name, PAGE.margin, 13, { maxWidth: PAGE.w - PAGE.margin * 2 - 30 });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`Page ${p + 1} of ${pages}`, PAGE.w - PAGE.margin, 13, { align: "right" });
    doc.setFontSize(9);
    doc.text(link, PAGE.margin, PAGE.h - 9);
    doc.text("Made with EpicMKT", PAGE.w - PAGE.margin, PAGE.h - 9, { align: "right" });
  }
  const h = cardHeight(prices);
  for (const cell of cells) {
    doc.setPage(cell.page + 2);
    if (cell.kind === "heading") {
      doc.setFillColor(...NAVY);
      doc.roundedRect(PAGE.margin, cell.y, PAGE.w - PAGE.margin * 2, HEADING_H - 2, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(pdfSafe(cell.title), PAGE.margin + 4, cell.y + 6, { maxWidth: PAGE.w - PAGE.margin * 2 - 8 });
      continue;
    }
    const { x, y, item } = cell;
    doc.setFillColor(...SOFT);
    doc.roundedRect(x, y, CARD_W, h, 2.5, 2.5, "F");
    const photo = photos.get(item.id);
    if (photo) doc.addImage(photo, "JPEG", x, y, CARD_W, CARD_W, undefined, "FAST");
    else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(34);
      doc.setTextColor(...MUTED);
      doc.text((pdfSafe(item.name)[0] ?? "?").toUpperCase(), x + CARD_W / 2, y + CARD_W / 2 + 6, { align: "center" });
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const all = doc.splitTextToSize(pdfSafe(item.name) || "Item", CARD_W - 6);
    const lines = all.slice(0, 2);
    if (all.length > 2) lines[1] = `${lines[1].replace(/\s+\S*$/, "").slice(0, 34)}...`;
    doc.text(lines, x + 3, y + CARD_W + 5.5);
    if (prices) {
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(pdfSafe(sharePrice(item)), x + 3, y + h - 3.5, { maxWidth: CARD_W - 6 });
    }
  }
  doc.setPage(1);
  return doc.output("blob");
}

export async function downloadCataloguePdf(opts, fileName) {
  saveBlob(await buildCataloguePdf(opts), fileName);
}
