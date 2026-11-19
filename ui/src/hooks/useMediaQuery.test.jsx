// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery.js";

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; });
const fake = (initial) => {
  let cb; const mql = { matches: initial, addEventListener: (_, f) => { cb = f; }, removeEventListener: () => {} };
  window.matchMedia = () => mql;
  return { fire: (v) => { mql.matches = v; cb && cb(); } };
};

describe("useMediaQuery", () => {
  it("does not crash and reports false when matchMedia is missing", () => {
    delete window.matchMedia;
    expect(renderHook(() => useMediaQuery("(max-width: 767px)")).result.current).toBe(false);
  });
  it("reports a matching query", () => { fake(true); expect(renderHook(() => useMediaQuery("(max-width: 767px)")).result.current).toBe(true); });
  it("updates when the screen changes", () => {
    const m = fake(false); const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(false); act(() => m.fire(true)); expect(result.current).toBe(true);
  });
});
