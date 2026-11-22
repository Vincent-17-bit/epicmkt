import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast, useToastStore } from "./toast.js";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("a plain showToast(message) is unchanged: no action, gone after 4.5 s", () => {
    showToast("Hello");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).not.toHaveProperty("action");
    vi.advanceTimersByTime(4499);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("carries an action and a longer duration when asked", () => {
    const onClick = vi.fn();
    showToast("Removed", { action: { label: "Undo", onClick }, duration: 6000 });
    const [toast] = useToastStore.getState().toasts;
    toast.action.onClick();
    expect(onClick).toHaveBeenCalled();
    vi.advanceTimersByTime(5900);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
