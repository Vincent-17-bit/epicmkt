import { beforeEach, describe, expect, it } from "vitest";
import { showToast, useToastStore } from "./toast.js";

beforeEach(() => useToastStore.setState({ toasts: [] }));

describe("toast store", () => {
  it("shows the same message once, however many times it is pushed", () => {
    showToast("Saved");
    showToast("Saved");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("shows at most three, newest last", () => {
    ["a", "b", "c", "d"].forEach((m) => showToast(m));
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(["b", "c", "d"]);
  });

  it("marks a problem message as an error and the rest as success", () => {
    showToast("We could not cancel that request.");
    showToast("Saved");
    expect(useToastStore.getState().toasts.map((t) => t.tone)).toEqual(["error", "success"]);
  });
});
