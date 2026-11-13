import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../api/index.js";
import { linkBrand, settleSpecLinks } from "./brandValue.js";
import { blockedText } from "./publishWire.js";

const type = { specRows: [
  { key: "material", label: "Material", level: "required", input: "openValue" },
  { key: "colour", label: "Colour", level: "optional", input: "openValue" },
  { key: "brand", label: "Brand", level: "required", input: "openValue" },
  { key: "memory", label: "Memory", level: "optional", input: "text" }
] };
const spec = (label, value) => ({ group: "Features & Specs", label, value });

afterEach(() => vi.restoreAllMocks());

describe("spec value links", () => {
  it("reuses a chosen value and looks up typed ones, skipping brand and plain rows", async () => {
    const add = vi.spyOn(api, "addOptionValue").mockResolvedValue({ value: { id: "v-new" } });
    const form = { specs: [spec("Material", "Oak"), spec("Colour", "Blue"), spec("Memory", "8 GB")], specValues: { material: { id: "v-oak", label: "Oak" } } };
    const links = await settleSpecLinks(form, type);
    expect(links).toEqual([{ slot: "spec", valueId: "v-oak" }, { slot: "spec", valueId: "v-new" }]);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("color", "Blue");
  });

  it("looks the value up again when the text was edited after choosing", async () => {
    const add = vi.spyOn(api, "addOptionValue").mockResolvedValue({ value: { id: "v-2" } });
    const links = await settleSpecLinks({ specs: [spec("Material", "Pine")], specValues: { material: { id: "v-oak", label: "Oak" } } }, type);
    expect(links).toEqual([{ slot: "spec", valueId: "v-2" }]);
    expect(add).toHaveBeenCalledWith("material", "Pine");
  });

  it("keeps the save going when a lookup fails, and has nothing for an untyped item", async () => {
    vi.spyOn(api, "addOptionValue").mockRejectedValue(new Error("x"));
    expect(await settleSpecLinks({ specs: [spec("Material", "Oak")] }, type)).toEqual([]);
    expect(await settleSpecLinks({ specs: [spec("Material", "Oak")] }, null)).toEqual([]);
  });

  it("sends the brand and the spec links in one call", async () => {
    const link = vi.spyOn(api, "linkItemValues").mockResolvedValue(2);
    await linkBrand("it-1", "b-1", false, [{ slot: "spec", valueId: "v-1" }]);
    expect(link).toHaveBeenCalledWith("it-1", [{ slot: "brand", valueId: "b-1" }, { slot: "spec", valueId: "v-1" }]);
  });

  it("sends nothing for an item that never had links, and clears links an item had", async () => {
    const link = vi.spyOn(api, "linkItemValues").mockResolvedValue(0);
    await linkBrand("it-1", null, false, []);
    expect(link).not.toHaveBeenCalled();
    await linkBrand("it-1", null, true, []);
    expect(link).toHaveBeenCalledWith("it-1", []);
  });
});

describe("publish refusal text", () => {
  it("lists what the server says is missing", () => {
    const err = { code: "publish_blocked", details: JSON.stringify([{ key: "material", label: "Material", message: "Material is required" }, { key: "colour", label: "Colour", message: "Colour is required" }]) };
    expect(blockedText(err)).toBe("Not published. Material is required. Colour is required.");
  });

  it("has a plain fallback and ignores other errors", () => {
    expect(blockedText({ code: "publish_blocked", details: "nope" })).toMatch(/required details are missing/);
    expect(blockedText({ code: "other" })).toBeNull();
  });
});
