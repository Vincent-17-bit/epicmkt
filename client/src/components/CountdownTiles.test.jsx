import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CountdownTiles from "./CountdownTiles.jsx";

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const MIN = 60000;
const HOUR = 60 * MIN;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CountdownTiles", () => {
  it("shows days, hours and minutes over 24 hours", () => {
    const { container } = render(<CountdownTiles endsAt={iso(50 * HOUR + 30 * MIN)} />);
    expect(container.textContent).toContain("02");
    expect(container.textContent).toMatch(/Days/);
    expect(container.querySelector("[data-urgency]").dataset.urgency).toBe("calm");
    expect(container.textContent).not.toMatch(/Sec/);
  });

  it("shows seconds under 24 hours and marks each urgency", () => {
    const cases = [
      [6 * HOUR, "soon"],
      [30 * MIN, "urgent"],
      [3 * MIN, "critical"]
    ];
    for (const [ms, urgency] of cases) {
      const { container, unmount } = render(<CountdownTiles endsAt={iso(ms)} />);
      expect(container.querySelector("[data-urgency]").dataset.urgency).toBe(urgency);
      expect(container.textContent).toMatch(/Sec/);
      unmount();
    }
  });

  it("is hidden from assistive tech and ticks down", () => {
    const { container } = render(<CountdownTiles endsAt={iso(90 * 1000)} variant="inline" />);
    const node = container.firstChild;
    expect(node).toHaveAttribute("aria-hidden", "true");
    const before = node.textContent;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.firstChild.textContent).not.toBe(before);
  });

  it("marks ended sales", () => {
    const { container } = render(<CountdownTiles endsAt={iso(-1000)} variant="chip" />);
    expect(container.firstChild.dataset.urgency).toBe("ended");
  });
});
