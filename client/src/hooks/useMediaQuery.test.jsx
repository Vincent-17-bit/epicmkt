import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery.js";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function fakeMedia(initial) {
  const state = { matches: initial, listeners: new Set(), adds: 0, removes: 0 };
  window.matchMedia = vi.fn((query) => ({
    get matches() {
      return state.matches;
    },
    media: query,
    addEventListener: (_, fn) => {
      state.adds += 1;
      state.listeners.add(fn);
    },
    removeEventListener: (_, fn) => {
      state.removes += 1;
      state.listeners.delete(fn);
    }
  }));
  return state;
}

describe("useMediaQuery", () => {
  it("reads the current value and follows changes", () => {
    const media = fakeMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 40rem)"));
    expect(result.current).toBe(false);
    act(() => {
      media.matches = true;
      media.listeners.forEach((fn) => fn());
    });
    expect(result.current).toBe(true);
  });

  it("subscribes once, not on every render", () => {
    const media = fakeMedia(false);
    const { rerender } = renderHook(() => useMediaQuery("(min-width: 40rem)"));
    rerender();
    rerender();
    rerender();
    expect(media.adds).toBe(1);
    expect(media.removes).toBe(0);
  });

  it("resubscribes when the query changes and cleans up on unmount", () => {
    const media = fakeMedia(false);
    const { rerender, unmount } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: "(min-width: 40rem)" } });
    rerender({ q: "(min-width: 64rem)" });
    expect(media.adds).toBe(2);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("returns false where matchMedia does not exist", () => {
    window.matchMedia = undefined;
    const { result } = renderHook(() => useMediaQuery("(min-width: 40rem)"));
    expect(result.current).toBe(false);
  });
});
