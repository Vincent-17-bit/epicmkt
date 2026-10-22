import { describe, it, expect } from "vitest";
import { crossChecks, emptyValues, validateAll } from "./formModel.js";
import { idNumberError } from "./idTypes.js";

const base = () => {
  const v = emptyValues();
  v.owner = { fullName: "", idType: "maisha_card", idNumber: "1234" };
  return v;
};

describe("idNumberError", () => {
  it("applies the rule of each ID type", () => {
    expect(idNumberError("national_id", "12345678")).toBe("");
    expect(idNumberError("national_id", "123456789")).toMatch(/7 or 8 digits/);
    expect(idNumberError("maisha_card", "123456789")).toBe("");
    expect(idNumberError("maisha_card", "123456")).toMatch(/7 to 9 digits/);
    expect(idNumberError("passport", "ab123456")).toBe("");
    expect(idNumberError("passport", "12")).toMatch(/6 to 9/);
    expect(idNumberError("maisha_card", "  ")).toBe("Enter your ID number");
  });
});

describe("validateAll", () => {
  it("shows a wrong ID number together with the other missing fields, not after them", () => {
    const errors = validateAll(base(), null);
    expect(errors.owner.fullName.message).toBeTruthy();
    expect(errors.owner.idNumber.message).toMatch(/Maisha Card number must be 7 to 9 digits/);
    expect(errors.email.message).toBeTruthy();
  });

  it("flags a registered business with no registration details, and an expired permit, straight away", () => {
    const v = base();
    v.business.registered = true;
    v.business.sbpExpiry = "2001-01-01";
    const paths = crossChecks(v).map(([p]) => p);
    expect(paths).toEqual(expect.arrayContaining(["business.regType", "business.regNumber", "business.kraPin", "business.sbpExpiry"]));
  });

  it("does not ask an unregistered business for a KRA PIN, but checks one that is given", () => {
    const v = base();
    v.business.registered = false;
    expect(crossChecks(v).map(([p]) => p)).not.toContain("business.kraPin");
    v.business.kraPin = "nope";
    expect(crossChecks(v).map(([p]) => p)).toContain("business.kraPin");
  });
});
