import { escapeHtml } from "./http.ts";

const DETAIL = /^([A-Za-z][A-Za-z ]{1,28}): (.+)$/;
const ACTION = /^(.{2,40}) \| (https?:\/\/\S+)$/;
const URL = /(https?:\/\/[^\s<]+)/g;

const link = (s: string) => s.replace(URL, (u) => `<a href="${u}" style="color:#0b6bcb">${u}</a>`);

const paragraph = (block: string) =>
  `<p style="margin:0 0 16px">${link(escapeHtml(block)).replace(/\r?\n/g, "<br>")}</p>`;

const details = (lines: string[]) => {
  const rows = lines.map((l) => {
    const [, label, value] = l.match(DETAIL)!;
    return `<tr><td style="padding:6px 12px 6px 0;color:#374151;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:700">${escapeHtml(value)}</td></tr>`;
  });
  return `<table role="presentation" style="margin:0 0 16px;padding:8px 16px;background:#f3f6fa;border-radius:8px;width:100%"><tbody>${rows.join("")}</tbody></table>`;
};

const button = (label: string, url: string) =>
  `<p style="margin:8px 0 20px"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#38b6ff;color:#111827;font-weight:700;text-decoration:none;border-radius:999px">${escapeHtml(label)}</a></p>`;

export function emailHtml(text: string): string {
  const blocks = text.replace(/^\s*EpicMKT:\s*/, "").trim().split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const body = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const action = lines.length === 1 ? block.match(ACTION) : null;
    if (action) return button(action[1], action[2]);
    if (lines.every((l) => DETAIL.test(l))) return details(lines);
    return paragraph(block);
  }).join("");
  return `<div style="margin:0;padding:24px 12px;background:#eef1f5;font-family:Arial,Helvetica,sans-serif">`
    + `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">`
    + `<div style="padding:16px 24px;background:#111827;color:#ffffff;font-size:18px;font-weight:700">EpicMKT</div>`
    + `<div style="padding:24px;color:#111827;font-size:15px;line-height:1.55">${body}</div>`
    + `<div style="padding:14px 24px;border-top:1px solid #e5e7eb;color:#374151;font-size:12px">EpicMKT helps local businesses go digital.</div>`
    + `</div></div>`;
}
