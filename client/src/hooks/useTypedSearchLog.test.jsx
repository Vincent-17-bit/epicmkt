import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const logSearch = vi.fn();
vi.mock("../api/index.js", () => ({ logSearch: (...a) => logSearch(...a) }));
const { useTypedSearchLog } = await import("./useTypedSearchLog.js");

beforeEach(() => {
  vi.useFakeTimers();
  logSearch.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useTypedSearchLog", () => {
  it("logs the word once, after the shopper stops typing", () => {
    const { result } = renderHook(() => useTypedSearchLog());
    act(() => result.current.typed("b"));
    act(() => result.current.typed("br"));
    act(() => result.current.typed("Bread "));
    act(() => vi.advanceTimersByTime(1000));
    expect(logSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(logSearch).toHaveBeenCalledTimes(1);
    expect(logSearch).toHaveBeenCalledWith("bread");
  });

  it("logs at once on Enter and does not log it a second time", () => {
    const { result } = renderHook(() => useTypedSearchLog());
    act(() => result.current.typed("red bull"));
    act(() => result.current.flush());
    act(() => vi.advanceTimersByTime(5000));
    expect(logSearch).toHaveBeenCalledTimes(1);
    expect(logSearch).toHaveBeenCalledWith("red bull");
  });

  it("logs a word typed just before leaving the page", () => {
    const { result, unmount } = renderHook(() => useTypedSearchLog());
    act(() => result.current.typed("cakes"));
    unmount();
    expect(logSearch).toHaveBeenCalledWith("cakes");
  });

  it("logs nothing for a single letter or a cleared box, and nothing when nothing was typed", () => {
    const { result, unmount } = renderHook(() => useTypedSearchLog());
    act(() => result.current.typed("b"));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.typed(""));
    act(() => vi.advanceTimersByTime(3000));
    unmount();
    expect(logSearch).not.toHaveBeenCalled();
  });
});
