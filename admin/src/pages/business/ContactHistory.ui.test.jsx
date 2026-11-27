import { describe, expect, it } from "vitest";
import { describeEntry } from "../../lib/contactHistory.js";
import { roleCan as can } from "../../auth/permissions.js";

describe("contact history wording", () => {
  it("shows phone numbers the international way, emails as they are, and who did it", () => {
    expect(describeEntry({ field: "phone", old: "+254712345678", new: "+256772123456", byAdmin: false, by: null })).toEqual({ label: "Phone", from: "+254 712 345678", to: "+256 772 123456", who: "by the seller" });
    expect(describeEntry({ field: "login_email", old: "a@b.co", new: "c@d.co", byAdmin: true, by: "Amina" })).toEqual({ label: "Sign-in email", from: "a@b.co", to: "c@d.co", who: "by Amina" });
    expect(describeEntry({ field: "whatsapp", old: "+254799000111", new: null, byAdmin: true, by: "" })).toMatchObject({ label: "WhatsApp", to: "removed", who: "by an admin" });
  });
});

describe("who can see and remove the history", () => {
  it("every admin who can see a business sees it; only the owner removes an entry", () => {
    for (const role of ["owner", "reviewer", "support", "finance"]) expect(can(role, "businesses.view")).toBe(true);
    expect(can("owner", "businesses.contact_history_delete")).toBe(true);
    for (const role of ["reviewer", "support", "finance"]) expect(can(role, "businesses.contact_history_delete")).toBe(false);
  });
});
